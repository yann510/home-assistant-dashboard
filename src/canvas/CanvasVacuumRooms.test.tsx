// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasDashboard } from './CanvasDashboard';
import { createHaFixture, deferred } from './testing/haFixture';
import { settleHistory } from './testing/history';

const rooms = ['Bedroom', 'Bathroom', 'Breakfast room', 'Kitchen', 'Office', 'Living room', 'Guest bedroom'];
const ref = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign((select: (state: unknown) => unknown) => ref.current!.useStore(select), {
    getState: () => ref.current!.getState(),
    subscribe: (listener: (state: unknown) => void) => ref.current!.subscribe(() => listener(ref.current!.getState())),
  }),
  useEntity: (id: string) => ref.current!.useStore(state => state.entities[id] ?? null),
  useHass: () => ({ joinHassUrl: (path: string) => path }),
  useIcon: () => null,
}));
beforeEach(() => {
  ref.current = createHaFixture();
  ref.current.publish('vacuum.roomba', 'docked', { supported_features: 8192 | 4 | 8 | 16 | 512 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function open() {
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  reopen();
}
function reopen() {
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vacuum' }));
}
function room(name: string) {
  return within(screen.getByRole('group', { name: 'Rooms to clean' })).getByRole('button', { name });
}
function select(names: string[]) {
  rooms.filter(name => !names.includes(name)).forEach(name => fireEvent.click(room(name)));
}
function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Start cleaning' }));
}

it('defaults to all rooms, allows an empty draft, and restores all rooms without dispatch', () => {
  open();
  rooms.forEach(name => expect(room(name).getAttribute('aria-pressed')).toBe('true'));
  select([]);
  expect(screen.getByRole('button', { name: 'Start cleaning' }).hasAttribute('disabled')).toBe(true);
  start();
  fireEvent.click(room('All rooms'));
  rooms.forEach(name => expect(room(name).getAttribute('aria-pressed')).toBe('true'));
  expect(ref.current!.calls).toHaveLength(0);
});
it.each([['Kitchen'], ['Bedroom', 'Breakfast room', 'Guest bedroom']])(
  'sends a single exact Google room request for %j and never claims targeting was observed',
  async (...names) => {
    open();
    select(names);
    start();
    await act(async () => {});
    expect(ref.current!.calls).toEqual([
      expect.objectContaining({
        domain: 'google_assistant_sdk',
        service: 'send_text_command',
        service_data: { command: `ask Roomba to go vacuum the ${names.map(name => name.toLowerCase()).join(' and ')}` },
      }),
    ]);
    expect(ref.current!.calls[0]).not.toHaveProperty('target');
    expect(screen.getByText('Selected rooms requested; room targeting is not verified.')).toBeTruthy();
    act(() => ref.current!.publish('vacuum.roomba', 'cleaning', { supported_features: 8192 | 4 }));
    expect(screen.queryByText('Roomba reported the requested state.')).toBeNull();
    expect(room('Kitchen').hasAttribute('disabled')).toBe(true);
  }
);
it('uses vacuum.start for all rooms and retains a draft through dialog navigation', async () => {
  open();
  fireEvent.click(room('Kitchen'));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await settleHistory();
  reopen();
  expect(room('Kitchen').getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(room('All rooms'));
  start();
  expect(ref.current!.calls).toEqual([
    expect.objectContaining({ domain: 'vacuum', service: 'start', target: { entity_id: ['vacuum.roomba'] } }),
  ]);
});
it('captures selection, blocks duplicate dispatch and edits while pending, and reports failure without fallback', async () => {
  const request = deferred();
  ref.current!.respondWith(() => request.promise);
  open();
  select(['Kitchen', 'Office']);
  start();
  start();
  fireEvent.click(room('Kitchen'));
  fireEvent.click(room('All rooms'));
  expect(room('Kitchen').getAttribute('aria-pressed')).toBe('true');
  expect(room('Bedroom').getAttribute('aria-pressed')).toBe('false');
  expect(ref.current!.calls).toHaveLength(1);
  expect(ref.current!.calls[0]).toEqual(
    expect.objectContaining({ service_data: { command: 'ask Roomba to go vacuum the kitchen and office' } })
  );
  await act(async () => request.reject(new Error('Google rejected')));
  expect(screen.getByRole('alert').textContent).toContain('Google rejected');
  expect(ref.current!.calls).toHaveLength(1);
  expect(room('Kitchen').hasAttribute('disabled')).toBe(false);
});
it('resumes paused cleaning via vacuum.start and locks the next-run room draft', () => {
  open();
  select(['Kitchen']);
  act(() => ref.current!.publish('vacuum.roomba', 'paused', { supported_features: 8192 | 4 | 8 | 16 }));
  expect(room('Kitchen').hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Resume cleaning' }));
  expect(ref.current!.calls).toEqual([expect.objectContaining({ domain: 'vacuum', service: 'start' })]);
});
it.each(['returning', 'cleaning', 'unavailable'])('locks room editing while %s', state => {
  open();
  act(() => ref.current!.publish('vacuum.roomba', state, { supported_features: 8192 | 4 | 8 | 16 }));
  expect(room('Kitchen').hasAttribute('disabled')).toBe(true);
  expect(ref.current!.calls).toHaveLength(0);
});
it('blocks offline editing and dispatch and marks a lost in-flight request unconfirmed without replay', async () => {
  const request = deferred();
  ref.current!.respondWith(() => request.promise);
  open();
  select(['Kitchen']);
  start();
  act(() => ref.current!.disconnect());
  await act(async () => {});
  expect(room('Kitchen').hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('Connection changed');
  act(() => ref.current!.reconnect());
  await act(async () => request.resolve({}));
  expect(ref.current!.calls).toHaveLength(1);
  expect(screen.getByRole('alert').textContent).toContain('Connection changed');
});
it('reports room request acknowledgement timeout without whole-house fallback', async () => {
  vi.useFakeTimers();
  ref.current!.respondWith(() => new Promise(() => {}));
  open();
  select(['Kitchen']);
  start();
  await act(async () => vi.advanceTimersByTime(15001));
  expect(screen.getByRole('alert').textContent).toContain('No service acknowledgement');
  expect(ref.current!.calls).toHaveLength(1);
});

// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasBlinds } from './CanvasBlinds';
import { createHaFixture, deferred } from './testing/haFixture';

const fixtureRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign((select: (state: unknown) => unknown) => fixtureRef.current!.useStore(select), {
    getState: () => fixtureRef.current!.getState(),
    subscribe: (listener: () => void) => fixtureRef.current!.subscribe(listener),
  }),
}));
let fixture: ReturnType<typeof createHaFixture>;
beforeEach(() => { fixture = createHaFixture(); fixtureRef.current = fixture; });
afterEach(cleanup);

const command = (index: number) => fixture.calls[index] as { type: string; domain: string; service: string; service_data: { command: string }; target?: unknown };
const choose = async (room: string) => userEvent.click(screen.getByRole('button', { name: `${room} blinds` }));

it('has independent room selection and disables commands when empty', async () => {
  render(<CanvasBlinds />);
  for (const room of ['Living room', 'Bedroom', 'Gym']) await choose(room);
  for (const action of ['Open', 'Stop', 'Close']) expect(screen.getByRole('button', { name: `${action} selected blinds` }).hasAttribute('disabled')).toBe(true);
  expect(fixture.calls).toHaveLength(0);
});

it('sends a captured two-room selection without fake entity targets', async () => {
  render(<CanvasBlinds />);
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(fixture.calls.map((_, i) => command(i).service_data.command)).toEqual([
    'open all the blinds living room', 'open all the blinds bedroom',
  ]);
  for (let index = 0; index < 2; index++) {
    expect(command(index).type).toBe('call_service');
    expect(command(index).domain).toBe('google_assistant_sdk');
    expect(command(index).service).toBe('send_text_command');
    expect(command(index).target).toBeUndefined();
  }
  expect(screen.getAllByText(/Command sent · position unavailable/)).toHaveLength(2);
});

it('keeps room targets captured while selection changes during a pending request', async () => {
  const first = deferred();
  const second = deferred();
  fixture.respondWith(message => String((message as { service_data: { command: string } }).service_data.command).includes('living room') ? first.promise : second.promise);
  render(<CanvasBlinds />);
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Close selected blinds' }));
  await choose('Living room');
  await choose('Gym');
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(fixture.calls.map((_, i) => command(i).service_data.command)).toEqual([
    'close all the blinds living room', 'close all the blinds bedroom',
  ]);
  await act(async () => first.resolve({}));
  expect(screen.getByText('Living room · Command sent · position unavailable')).toBeTruthy();
  expect(screen.getByText('Bedroom · Sending command…')).toBeTruthy();
  await act(async () => second.resolve({}));
  expect(screen.getByText('Living room · Command sent · position unavailable')).toBeTruthy();
  expect(screen.getByText('Bedroom · Command sent · position unavailable')).toBeTruthy();
});

it('reports a partial failure and retries only its immutable failed room', async () => {
  fixture.respondWith(message => String((message as { service_data: { command: string } }).service_data.command).includes('bedroom') ? Promise.reject(new Error('Assistant unavailable')) : Promise.resolve({}));
  render(<CanvasBlinds />);
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry Open for failed rooms' })).toBeTruthy());
  const feedback = screen.getByRole('group', { name: 'Open blind command results' });
  expect(within(feedback).getByText('Living room · Command sent · position unavailable')).toBeTruthy();
  expect(within(feedback).getByText(/Bedroom · Assistant unavailable/)).toBeTruthy();
  await choose('Bedroom');
  fixture.respondWith(() => Promise.resolve({}));
  await userEvent.click(screen.getByRole('button', { name: 'Retry Open for failed rooms' }));
  await waitFor(() => expect(fixture.calls).toHaveLength(3));
  expect(command(2).service_data.command).toBe('open all the blinds bedroom');
  expect(screen.queryByRole('button', { name: 'Retry Open for failed rooms' })).toBeNull();
});

it('does not dispatch while disconnected and describes the failure', async () => {
  act(() => fixture.disconnect());
  render(<CanvasBlinds />);
  expect(screen.getByRole('button', { name: 'Open selected blinds' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/Home Assistant is disconnected/)).toBeTruthy();
  expect(fixture.calls).toHaveLength(0);
});

it('keeps Stop available while Open waits and sends an independent Stop command', async () => {
  const opening = deferred();
  fixture.respondWith(message => String((message as { service_data: { command: string } }).service_data.command).startsWith('open') ? opening.promise : Promise.resolve({}));
  render(<CanvasBlinds />);
  await choose('Bedroom');
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  expect(screen.getByRole('button', { name: 'Stop selected blinds' }).hasAttribute('disabled')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Stop selected blinds' }));
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(command(1).service_data.command).toBe('stop all the blinds living room');
  await act(async () => opening.resolve({}));
});

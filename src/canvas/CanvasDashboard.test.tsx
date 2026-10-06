// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { settleHistory } from './testing/history';
import { CanvasDashboard } from './CanvasDashboard';
import { createHaFixture } from './testing/haFixture';
import { DashboardViews } from '../DashboardViews';

const fixtureRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign((select: (state: unknown) => unknown) => fixtureRef.current!.useStore(select), {
    getState: () => fixtureRef.current!.getState(),
    subscribe: (listener: (state: unknown) => void) => fixtureRef.current!.subscribe(() => listener(fixtureRef.current!.getState())),
  }),
  useEntity: (id: string) => fixtureRef.current!.useStore(state => state.entities[id] ?? null),
  useHass: () => ({ joinHassUrl: (path: string) => path }),
  useIcon: () => null,
}));
const fixture = createHaFixture();
fixtureRef.current = fixture;

afterEach(() => {
  cleanup();
  fixture.reset();
});

it.each(['', 'classic', 'quiet', 'canvas', 'unknown'])('always renders Canvas for view=%s without switching controls', view => {
  history.replaceState(null, '', view ? `/?view=${view}&keep=1` : '/?keep=1');
  render(<DashboardViews />);
  expect(screen.getByRole('heading', { name: /Make yourself at home/ })).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Dashboard view' })).toBeNull();
  expect(fixture.calls).toHaveLength(0);
  history.replaceState(null, '', '/');
});

it('mounts and reconnects without sending service calls', () => {
  render(<CanvasDashboard />);
  expect(screen.getByRole('heading', { name: /Make yourself at home/ })).toBeTruthy();
  expect(fixture.calls).toHaveLength(0);
  act(() => fixture.disconnect());
  expect(screen.getByText(/Disconnected/)).toBeTruthy();
  act(() => fixture.reconnect());
  expect(fixture.calls).toHaveLength(0);
});

it('uses one dialog and returns from a detail route to the device directory', async () => {
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Speakers' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('dialog', { name: 'Speakers' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await settleHistory();
  expect(screen.getByRole('dialog', { name: 'All devices' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  await settleHistory();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'All devices' }));
});

it('owns room-picker Back/Forward, selection and Escape without leaving the overview', async () => {
  history.replaceState({ host: 'keep' }, '', '/?view=canvas&keep=1#lights');
  render(<CanvasDashboard />);
  const trigger = screen.getByRole('button', { name: 'Lights room' });
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Choose a room' })).toBeTruthy();
  history.back();
  await settleHistory();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  history.forward();
  await settleHistory();
  fireEvent.click(screen.getByRole('option', { name: 'Gym' }));
  await settleHistory();
  expect(trigger.textContent).toContain('Gym');
  expect(screen.queryByRole('dialog')).toBeNull();
  history.forward();
  await settleHistory();
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  await settleHistory();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(history.state.host).toBe('keep');
  expect(location.href).toContain('/?view=canvas&keep=1#lights');
  expect(fixture.calls).toEqual([]);
});

it.each(['picker', 'settings'])('replaces a home %s when opening a parent route, with no stranded layer', async overlay => {
  fixture.publish('light.light_living_room_bulbs', 'on', { friendly_name: 'Living Room', brightness: 128, supported_color_modes: ['brightness'] });
  render(<CanvasDashboard />);
  if (overlay === 'picker') fireEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  else fireEvent.click(screen.getByRole('button', { name: 'Living Room settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('dialog', { name: 'All devices' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Close light settings' })).toBeNull();
  history.back();
  await settleHistory();
  expect(screen.queryByRole('dialog')).toBeNull();
  history.forward();
  await settleHistory();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('dialog', { name: 'All devices' })).toBeTruthy();
  expect(fixture.calls).toEqual([]);
});

it.each(['home', 'all'])('restores %s light settings through Back/Forward and consumes Close/Escape entries', async owner => {
  fixture.publish('light.light_living_room_bulbs', 'on', { friendly_name: 'Living Room', brightness: 128, supported_color_modes: ['brightness'] });
  const mounted = render(<CanvasDashboard />);
  if (owner === 'all') {
    fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lights' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lights' }));
  }
  const container = () => owner === 'all' ? screen.getByRole('dialog', { name: 'All lights' }) : screen.getByRole('main');
  const trigger = within(container()).getByRole('button', { name: 'Living Room settings' });
  const body = container().querySelector('.canvas-dialog__body');
  if (body) body.scrollTop = 321;
  fireEvent.click(trigger);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close light settings' }));
  history.back();
  await settleHistory();
  expect(screen.queryByRole('button', { name: 'Close light settings' })).toBeNull();
  expect(document.activeElement).toBe(trigger);
  if (body) expect(body.scrollTop).toBe(321);
  history.forward();
  await settleHistory();
  fireEvent.click(screen.getByRole('button', { name: 'Close light settings' }));
  await settleHistory();
  history.forward();
  await settleHistory();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close light settings' }), { key: 'Escape' });
  await settleHistory();
  expect(screen.queryByRole('button', { name: 'Close light settings' })).toBeNull();
  if (owner === 'all') {
    history.forward();
    await settleHistory();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    await settleHistory(2);
    expect(screen.queryByRole('dialog')).toBeNull();
    history.forward();
    await settleHistory();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('lights');
    history.forward();
    await settleHistory();
    history.forward();
    await settleHistory();
    expect(screen.getByRole('dialog', { name: 'All lights' }).contains(screen.getByRole('button', { name: 'Close light settings' }))).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close light settings' }));
  } else {
    history.forward();
    await settleHistory();
  }
  mounted.unmount();
  render(<CanvasDashboard />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Close light settings' })).toBeNull();
  expect(fixture.calls).toEqual([]);
});

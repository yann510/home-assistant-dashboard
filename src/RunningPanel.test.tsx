// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RunningPanel } from './RunningPanel';
import { AppliancesCard } from './AppliancesCard';
const ha = vi.hoisted(() => ({ connected: true, entities: {} as Record<string, { state: string }> }));
vi.mock('@hakit/core', () => ({
  useEntity: (id: string) => ha.entities[id] ?? null,
  useStore: (select: (state: unknown) => unknown) =>
    select({ connection: { connected: ha.connected }, connectionStatus: ha.connected ? 'connected' : 'disconnected' }),
}));
function dryer(machine = 'run', job = 'drying', completion = 'unknown') {
  ha.entities = {
    'sensor.dryer_dryer_machine_state': { state: machine },
    'sensor.dryer_dryer_job_state': { state: job },
    'sensor.dryer_dryer_completion_time': { state: completion },
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  ha.entities = {};
  ha.connected = true;
});
it('shows live laundry activity without invented progress and removes it once finished', () => {
  dryer();
  const view = render(<RunningPanel />);
  expect(screen.getByRole('region', { name: 'In progress' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /Dryer.*Drying/ })).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  dryer('stop', 'finished');
  view.rerender(<RunningPanel />);
  expect(screen.queryByRole('region')).toBeNull();
});
it.each(['stop', 'unknown', 'unavailable', ''])('hides non-running machine %s', machine => {
  dryer(machine);
  render(<RunningPanel />);
  expect(screen.queryByRole('region')).toBeNull();
});
it.each([['run', 'finish'], ['run', 'finished'], ['pause', 'finish'], ['pause', 'finished']])('does not show stale %s with terminal job %s', (machine, job) => {
  dryer(machine, job);
  render(<RunningPanel />);
  expect(screen.queryByRole('region')).toBeNull();
});
it('does not show missing machines', () => {
  render(<RunningPanel />);
  expect(screen.queryByRole('region')).toBeNull();
});
it('hides cached active cycles while disconnected', () => {
  dryer();
  ha.connected = false;
  render(<RunningPanel />);
  expect(screen.queryByRole('region')).toBeNull();
});
it('falls back to Running for a missing activity', () => {
  dryer('run', 'unknown');
  render(<RunningPanel />);
  expect(screen.getByRole('link', { name: /Dryer.*Running/ })).toBeTruthy();
});
it('updates the ETA by the clock and drops it when expired', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  dryer('run', 'drying', '2026-09-10T12:02:00Z');
  render(<RunningPanel />);
  expect(screen.getByText('Drying · ~2 min left')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Drying · ~1 min left')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Drying')).toBeTruthy();
});
it('scrolls and focuses the full card from a running item', () => {
  dryer();
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  render(
    <>
      <RunningPanel />
      <AppliancesCard />
    </>
  );
  fireEvent.click(screen.getByRole('link', { name: /Dryer/ }));
  expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Appliances' }));
  expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
});
it('shows both laundry machines and respects reduced motion when opening details', () => {
  dryer();
  ha.entities['sensor.washer_washer_machine_state'] = { state: 'run' };
  ha.entities['sensor.washer_washer_job_state'] = { state: 'rinse' };
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  render(
    <>
      <RunningPanel />
      <AppliancesCard />
    </>
  );
  expect(screen.getByRole('link', { name: /Washer.*Rinsing/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: /Washer/ }));
  expect(scroll).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' });
  vi.unstubAllGlobals();
});
it('refreshes the ETA when returning to the dashboard after time away', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  dryer('run', 'drying', '2026-09-10T12:10:00Z');
  render(<RunningPanel />);
  vi.setSystemTime(new Date('2026-09-10T12:05:00Z'));
  fireEvent(document, new Event('visibilitychange'));
  expect(screen.getByText('Drying · ~5 min left')).toBeTruthy();
});
it('uses quiet icons and instant navigation in Night mode', () => {
  dryer();
  ha.entities['input_boolean.night_mode'] = { state: 'on' };
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  render(
    <>
      <RunningPanel />
      <AppliancesCard />
    </>
  );
  expect(screen.getByRole('region', { name: 'In progress' }).classList.contains('running-quiet')).toBe(true);
  fireEvent.click(screen.getByRole('link', { name: /Dryer/ }));
  expect(scroll).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' });
});

it('shows dishwasher activity and removes it on completion', () => {
  ha.entities['sensor.dishwasher_dishwasher_machine_state'] = { state: 'run' };
  ha.entities['sensor.dishwasher_dishwasher_job_state'] = { state: 'washing' };
  const view = render(<RunningPanel />);
  expect(screen.getByRole('link', { name: /Dishwasher.*Washing/ }).getAttribute('href')).toBe('#appliances-card');
  ha.entities['sensor.dishwasher_dishwasher_job_state'].state = 'finish';
  view.rerender(<RunningPanel />);
  expect(screen.queryByRole('region')).toBeNull();
});
it.each(['washer', 'dryer', 'dishwasher'])('keeps paused %s visible without a running animation or ETA', kind => {
  ha.entities[`sensor.${kind}_${kind}_machine_state`] = { state: 'pause' };
  ha.entities[`sensor.${kind}_${kind}_job_state`] = { state: 'wash' };
  ha.entities[`sensor.${kind}_${kind}_completion_time`] = { state: '2099-01-01T12:00:00Z' };
  render(<RunningPanel />);
  expect(screen.getByRole('region', { name: 'In progress' })).toBeTruthy();
  expect(screen.getByText('Paused')).toBeTruthy();
  expect(screen.queryByText(/min left/)).toBeNull();
  expect(screen.getByRole('link').querySelector('svg')?.getAttribute('data-state')).toBe('paused');
});
it.each([['cleaning', 'Cleaning'], ['returning', 'Returning to dock']])('shows Roomba %s and focuses its actual card', (state, label) => {
  ha.entities['vacuum.roomba'] = { state };
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  render(<><RunningPanel /><div id='attention-target-vacuum' tabIndex={-1}>Vacuum details</div></>);
  const link = screen.getByRole('link', { name: `Roomba ${label}` });
  expect(link.getAttribute('href')).toBe('#attention-target-vacuum');
  fireEvent.click(link);
  expect(document.activeElement?.id).toBe('attention-target-vacuum');
  expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
});
it.each(['docked', 'idle', 'paused', 'error', 'unknown', 'unavailable'])('leaves Roomba %s out of the activity area', state => {
  ha.entities['vacuum.roomba'] = { state };
  render(<RunningPanel />);
  expect(screen.queryByRole('region')).toBeNull();
});
it('hides cached dishwasher and Roomba activity while disconnected', () => {
  ha.entities['sensor.dishwasher_dishwasher_machine_state'] = { state: 'run' };
  ha.entities['vacuum.roomba'] = { state: 'cleaning' };
  ha.connected = false;
  render(<RunningPanel />);
  expect(screen.queryByRole('region')).toBeNull();
});
it('shows all four active devices together and removes only the device that stops', () => {
  for (const kind of ['washer', 'dryer', 'dishwasher']) ha.entities[`sensor.${kind}_${kind}_machine_state`] = { state: 'run' };
  ha.entities['vacuum.roomba'] = { state: 'cleaning' };
  const view = render(<RunningPanel />);
  expect(screen.getAllByRole('link')).toHaveLength(4);
  ha.entities['vacuum.roomba'].state = 'docked';
  view.rerender(<RunningPanel />);
  expect(screen.getAllByRole('link')).toHaveLength(3);
  expect(screen.queryByRole('link', { name: /Roomba/ })).toBeNull();
});
it('opens a hidden appliance panel through the Quiet Home navigation callback', () => {
  dryer();
  const onNavigate = vi.fn();
  render(<RunningPanel onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole('link', { name: /Dryer/ }));
  expect(onNavigate).toHaveBeenCalledExactlyOnceWith('appliances-card');
});

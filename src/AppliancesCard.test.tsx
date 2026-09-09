// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppliancesCard } from './AppliancesCard';

const ha = vi.hoisted(() => ({ connected: true, entities: {} as Record<string, { state: string }> }));
vi.mock('@hakit/core', () => ({
  useEntity: (id: string) => ha.entities[id] ?? null,
  useStore: (select: (state: unknown) => unknown) =>
    select({ connection: { connected: ha.connected }, connectionStatus: ha.connected ? 'connected' : 'disconnected' }),
  useIcon: () => null,
}));
function dryer(machine: string, job = 'drying', completion = '2026-09-10T12:25:00Z') {
  ha.entities = {
    'sensor.dryer_dryer_machine_state': { state: machine },
    'sensor.dryer_dryer_job_state': { state: job },
    'sensor.dryer_dryer_completion_time': { state: completion },
    'sensor.dishwasher_dishwasher_machine_state': { state: 'stop' },
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  ha.entities = {};
  ha.connected = true;
});
it('keeps all appliances visible and distinguishes idle from unavailable', () => {
  dryer('stop');
  render(<AppliancesCard />);
  for (const name of ['Washer', 'Dryer', 'Dishwasher']) expect(screen.getByText(name)).toBeTruthy();
  expect(screen.getAllByText('Idle')).toHaveLength(2);
  expect(screen.getByText('Unavailable')).toBeTruthy();
});
it('updates remaining minutes without a sensor update and drops an expired estimate', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  dryer('run');
  render(<AppliancesCard />);
  expect(screen.getByText('Drying · ~25 min left')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Drying · ~24 min left')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(24 * 60_000);
  });
  expect(screen.getByText('Drying')).toBeTruthy();
});
it.each(['unknown', 'unavailable', 'bad-date', '2026-09-09T12:00:00Z'])('omits unusable estimate %s', completion => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  dryer('run', 'drying', completion);
  render(<AppliancesCard />);
  expect(screen.getByText('Drying')).toBeTruthy();
  expect(screen.queryByText(/min left/)).toBeNull();
});
it.each([
  ['pause', 'drying', 'Paused'],
  ['stop', 'finished', 'Idle'],
  ['run', 'unknown', 'Running'],
  ['unknown', 'drying', 'Unknown'],
])('handles %s / %s honestly', (machine, job, label) => {
  dryer(machine, job, 'unknown');
  render(<AppliancesCard />);
  expect(screen.getAllByText(label).length).toBeGreaterThan(0);
});
it('does not present cached states as live while disconnected', () => {
  dryer('run');
  ha.connected = false;
  render(<AppliancesCard />);
  expect(screen.getAllByText('Unavailable')).toHaveLength(3);
});
it('updates icon state on pause and disables running appearance after disconnect', () => {
  dryer('run');
  const view = render(<AppliancesCard />);
  const icon = () => screen.getByText('Dryer').closest('li')?.querySelector('svg');
  expect(icon()?.getAttribute('data-state')).toBe('running');
  dryer('pause');
  view.rerender(<AppliancesCard />);
  expect(icon()?.getAttribute('data-state')).toBe('paused');
  dryer('stop');
  view.rerender(<AppliancesCard />);
  expect(icon()?.getAttribute('data-state')).toBe('idle');
  dryer('run');
  ha.connected = false;
  view.rerender(<AppliancesCard />);
  expect(icon()?.getAttribute('data-state')).toBe('unavailable');
});

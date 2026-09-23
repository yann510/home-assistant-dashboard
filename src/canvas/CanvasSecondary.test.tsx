// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasDashboard } from './CanvasDashboard';
import { classifyAppliance, classifyVacuum } from './activity';
import { createHaFixture, deferred } from './testing/haFixture';

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
});
afterEach(cleanup);

it('classifies running, paused, finished, unknown and offline without inventing a duration', () => {
  expect(classifyAppliance('washer', 'run', 'wash', undefined, 0)).toMatchObject({ status: 'Washing', active: true });
  expect(classifyAppliance('washer', 'run', 'wash', undefined, 0).status).not.toMatch(/0 min|0 minutes/);
  expect(classifyAppliance('dryer', 'pause', 'drying', undefined, 0).status).toBe('Paused');
  expect(classifyAppliance('dishwasher', 'run', 'finished', undefined, 0).status).toBe('Finished');
  expect(classifyAppliance('washer', 'mystery', undefined, undefined, 0).status).toBe('Unknown');
  expect(classifyAppliance('washer', 'unavailable', undefined, undefined, 0).status).toBe('Unavailable');
  expect(classifyVacuum('returning')).toMatchObject({ status: 'Returning to dock', active: true });
  expect(classifyVacuum('unavailable').status).toBe('Unavailable');
});

it('shows running activity alongside actionable attention and opens its context', () => {
  ref.current!.publish('sensor.washer_washer_machine_state', 'run');
  ref.current!.publish('sensor.washer_washer_job_state', 'wash');
  ref.current!.publish('sensor.dashboard_attention', '1', {
    ready: true,
    items: [
      {
        id: 'bin',
        episode: 'bin-1',
        title: 'Empty Roomba bin',
        detail: 'Bin full',
        tone: 'amber',
        icon: 'bin',
        target: 'vacuum',
        kind: 'condition',
        occurred_at: new Date().toISOString(),
        snoozed_until: null,
        snooze_seconds: 3600,
      },
    ],
  });
  render(<CanvasDashboard />);
  expect(screen.getByRole('button', { name: /Washer.*Washing/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /View.*Empty Roomba bin/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /View.*Empty Roomba bin/ }));
  expect(screen.getByRole('dialog', { name: 'Roomba' })).toBeTruthy();
  expect(screen.getByText(/Empty Roomba’s bin/)).toBeTruthy();
});

it('never treats missing activity sensors as an all-clear and keeps reminder episodes current', () => {
  const item = {
    id: 'hilo',
    episode: 'hilo-1',
    title: 'Gateway offline',
    detail: 'Connection lost',
    tone: 'amber',
    icon: 'connection',
    target: 'temperature',
    kind: 'condition',
    occurred_at: new Date().toISOString(),
    snoozed_until: null,
    snooze_seconds: 3600,
  };
  ref.current!.publish('sensor.dashboard_attention', '1', { ready: true, items: [item] });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Snooze: Gateway offline' }));
  expect(ref.current!.calls).toContainEqual(
    expect.objectContaining({ domain: 'dashboard_attention', service: 'snooze', service_data: { id: 'hilo', episode: 'hilo-1' } })
  );
  fireEvent.click(screen.getByRole('button', { name: 'View: Gateway offline' }));
  expect(screen.getByRole('dialog', { name: 'Thermostats' })).toBeTruthy();
  act(() =>
    ref.current!.publish('sensor.dashboard_attention', '2', {
      ready: true,
      items: [{ ...item, episode: 'hilo-2', detail: 'Still offline' }],
    })
  );
  expect(within(screen.getByRole('dialog')).getByText('Still offline')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  act(() => ref.current!.publish('sensor.dashboard_attention', '3', { ready: true, items: [] }));
  expect(screen.getByText('Activity status unavailable for some devices.')).toBeTruthy();
});

it('with all appliances idle, does not claim all clear while attention is unavailable', () => {
  for (const prefix of ['washer_washer', 'dryer_dryer', 'dishwasher_dishwasher'])
    ref.current!.publish(`sensor.${prefix}_machine_state`, 'stop');
  ref.current!.publish('vacuum.roomba', 'docked');
  ref.current!.publish('sensor.dashboard_attention', 'unavailable');
  render(<CanvasDashboard />);
  expect(screen.queryByText('All quiet at home.')).toBeNull();
  expect(screen.getByText('Attention reminders are unavailable.')).toBeTruthy();
});

it('sends completion dismissal with the exact episode while retaining live activity', () => {
  ref.current!.publish('sensor.dishwasher_dishwasher_machine_state', 'run');
  ref.current!.publish('sensor.dishwasher_dishwasher_job_state', 'wash');
  ref.current!.publish('sensor.dashboard_attention', '1', {
    ready: true,
    items: [
      {
        id: 'dishwasher-finished',
        episode: 'dishwasher-42',
        title: 'Dishwasher finished',
        detail: 'Cycle complete',
        tone: 'blue',
        icon: 'dishwasher',
        target: 'appliances',
        kind: 'completion',
        occurred_at: new Date().toISOString(),
        snoozed_until: null,
        snooze_seconds: 3600,
      },
    ],
  });
  render(<CanvasDashboard />);
  expect(screen.getByRole('button', { name: /Dishwasher.*Washing/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Done: Dishwasher finished' }));
  expect(ref.current!.calls).toContainEqual(
    expect.objectContaining({
      domain: 'dashboard_attention',
      service: 'dismiss',
      service_data: { id: 'dishwasher-finished', episode: 'dishwasher-42' },
    })
  );
  expect(screen.getByRole('button', { name: /Dishwasher.*Washing/ })).toBeTruthy();
});

it('preserves one mood controller across overview and detail, including End and recovery retry', async () => {
  ref.current!.publish('sensor.house_mood', 'active', { active_mood: 'love' });
  render(<CanvasDashboard />);
  for (const name of ['Love', 'Unwind', 'Dinner', 'Party', 'Gym'])
    expect(screen.getByRole('button', { name: `${name} mood` })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'End mood' }));
  expect(ref.current!.calls).toContainEqual(expect.objectContaining({ domain: 'house_moods', service: 'end' }));
  fireEvent.click(screen.getByRole('button', { name: 'Explore moods' }));
  expect(screen.getByRole('dialog', { name: 'House Mood' })).toBeTruthy();
  act(() =>
    ref.current!.publish('sensor.house_mood', 'recovery_required', { errors: [{ target: 'lamp', message: 'Could not restore lamp' }] })
  );
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retry restoration' }));
  expect(ref.current!.calls).toContainEqual(expect.objectContaining({ domain: 'house_moods', service: 'retry_restoration' }));
});

it('finds real devices by name and room and reaches every secondary category', () => {
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  const dialog = screen.getByRole('dialog', { name: 'All devices' });
  const search = within(dialog).getByRole('searchbox', { name: 'Find a device or room' });
  fireEvent.change(search, { target: { value: 'laundry' } });
  expect(within(dialog).getByRole('button', { name: /Laundry/ })).toBeTruthy();
  fireEvent.change(search, { target: { value: 'Bedroom' } });
  expect(within(dialog).getByRole('button', { name: /Bedroom blinds/ })).toBeTruthy();
  expect(within(dialog).getByRole('button', { name: /Bedroom thermostat/ })).toBeTruthy();
  fireEvent.change(search, { target: { value: '' } });
  for (const destination of [
    'All lights',
    'Blinds',
    'Player',
    'Speakers',
    'Weather',
    'House Mood',
    'Thermostats',
    'Appliances',
    'Roomba',
  ]) {
    expect(within(dialog).getByRole('button', { name: destination })).toBeTruthy();
  }
  for (const destination of [
    'All lights',
    'Blinds',
    'Player',
    'Speakers',
    'Weather',
    'House Mood',
    'Thermostats',
    'Appliances',
    'Roomba',
  ]) {
    fireEvent.click(within(screen.getByRole('dialog', { name: 'All devices' })).getByRole('button', { name: destination }));
    expect(screen.getByRole('dialog', { name: destination })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  }
});

it('opens a searched blind room with only that room selected for commands', () => {
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  const dialog = screen.getByRole('dialog', { name: 'All devices' });
  fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Find a device or room' }), { target: { value: 'Bedroom blinds' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Bedroom blinds' }));
  const controls = screen.getByRole('dialog', { name: 'Bedroom blinds' });
  expect(within(controls).getByRole('button', { name: 'Bedroom blinds' }).getAttribute('aria-pressed')).toBe('true');
  expect(within(controls).getByRole('button', { name: 'Living room blinds' }).getAttribute('aria-pressed')).toBe('false');
  expect(within(controls).getByRole('button', { name: 'Gym blinds' }).getAttribute('aria-pressed')).toBe('false');
});

it('keeps pending blind targets and Stop after navigating from Bedroom to Gym', async () => {
  const opening = deferred();
  ref.current!.respondWith(message =>
    String((message as { service_data: { command: string } }).service_data.command).startsWith('open')
      ? opening.promise
      : Promise.resolve({})
  );
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  const search = within(screen.getByRole('dialog')).getByRole('searchbox', { name: 'Find a device or room' });
  fireEvent.change(search, { target: { value: 'Bedroom blinds' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bedroom blinds' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open selected blinds' }));
  expect(ref.current!.calls).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('searchbox', { name: 'Find a device or room' }), {
    target: { value: 'Gym blinds' },
  });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gym blinds' }));
  const gym = screen.getByRole('dialog', { name: 'Gym blinds' });
  expect(within(gym).getByRole('button', { name: 'Open selected blinds' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(within(gym).getByRole('button', { name: 'Stop moving blinds in Bedroom' }));
  expect(ref.current!.calls).toHaveLength(2);
  expect((ref.current!.calls[1] as { service_data: { command: string } }).service_data.command).toBe('stop all the blinds bedroom');
  await act(async () => opening.resolve({}));
});

it('searches actual speaker friendly names and routes to live speaker controls', () => {
  ref.current!.publish('media_player.bathroom', 'idle', { friendly_name: 'Bath Sonos', supported_features: 12, volume_level: 0.3 });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('searchbox', { name: 'Find a device or room' }), {
    target: { value: 'Bath Sonos' },
  });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bath Sonos' }));
  expect(screen.getByRole('dialog', { name: 'Speakers' })).toBeTruthy();
  expect(ref.current!.calls).toHaveLength(0);
});

it('mounts and reconnects Roomba detail without sending a command, filtering unsupported controls', () => {
  ref.current!.publish('vacuum.roomba', 'docked', {
    supported_features: 8192 | 512,
    battery_level: 67,
    fan_speed: 'Standard',
    fan_speed_list: ['Quiet', 'Standard'],
  });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roomba' }));
  const detail = screen.getByRole('dialog', { name: 'Roomba' });
  expect(within(detail).getByRole('button', { name: 'Start cleaning' })).toBeTruthy();
  expect(within(detail).getByRole('button', { name: 'Locate Roomba' })).toBeTruthy();
  expect(within(detail).queryByRole('button', { name: 'Return to dock' })).toBeNull();
  expect(within(detail).queryByRole('button', { name: 'Set fan speed' })).toBeNull();
  expect(ref.current!.calls).toHaveLength(0);
  act(() => ref.current!.disconnect());
  act(() => ref.current!.reconnect());
  expect(ref.current!.calls).toHaveLength(0);
});

it('reports a rejected Roomba command and requires an explicit fan-speed apply', async () => {
  ref.current!.publish('vacuum.roomba', 'cleaning', {
    supported_features: 4 | 8 | 16 | 32,
    fan_speed: 'Standard',
    fan_speed_list: ['Quiet', 'Standard'],
  });
  ref.current!.respondWith(() => Promise.reject(new Error('Vacuum denied')));
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roomba' }));
  expect(ref.current!.calls).toHaveLength(0);
  fireEvent.change(screen.getByRole('combobox', { name: 'Roomba fan speed' }), { target: { value: 'Quiet' } });
  expect(ref.current!.calls).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Set fan speed' }));
  expect(ref.current!.calls).toContainEqual(
    expect.objectContaining({ domain: 'vacuum', service: 'set_fan_speed', service_data: { fan_speed: 'Quiet' } })
  );
  await act(async () => {});
  expect(screen.getByRole('alert').textContent).toContain('Vacuum denied');
});

it('sends one Roomba command while pending and waits for the reported state', async () => {
  const starting = deferred();
  ref.current!.publish('vacuum.roomba', 'docked', { supported_features: 8192 });
  ref.current!.respondWith(() => starting.promise);
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roomba' }));
  const start = screen.getByRole('button', { name: 'Start cleaning' });
  fireEvent.click(start);
  fireEvent.click(start);
  expect(ref.current!.calls).toHaveLength(1);
  await act(async () => starting.resolve({}));
  expect(screen.getByText(/Service accepted; device response is not yet verified/)).toBeTruthy();
  act(() => ref.current!.publish('vacuum.roomba', 'cleaning', { supported_features: 8192 }));
  expect(screen.getByText('Roomba reported the requested state.')).toBeTruthy();
});

it('keeps thermostat capability limits and reports a rejected command', async () => {
  ref.current!.publish('climate.thermostat_office', 'heat', {
    temperature: 20,
    current_temperature: 19,
    min_temp: 19,
    max_temp: 21,
    target_temp_step: 1,
    supported_features: 1,
    hvac_action: 'heating',
  });
  ref.current!.respondWith(() => Promise.reject(new Error('Denied')));
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thermostats' }));
  fireEvent.click(screen.getByRole('button', { name: 'Raise Office target temperature' }));
  expect(ref.current!.calls).toContainEqual(
    expect.objectContaining({ domain: 'climate', service: 'set_temperature', service_data: { temperature: 21 } })
  );
  await act(async () => {});
  expect(screen.getByRole('alert').textContent).toContain('Denied');
});

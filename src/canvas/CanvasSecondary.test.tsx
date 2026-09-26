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
  fireEvent.click(screen.getByRole('button', { name: 'View: Gateway offline' }));
  fireEvent.click(screen.getByRole('button', { name: 'Snooze: Gateway offline' }));
  expect(ref.current!.calls).toContainEqual(
    expect.objectContaining({ domain: 'dashboard_attention', service: 'snooze', service_data: { id: 'hilo', episode: 'hilo-1' } })
  );
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
  fireEvent.click(screen.getByRole('button', { name: 'View: Dishwasher finished' }));
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

it('keeps simultaneous appliance activity and a new completion episode while an old dismissal is pending', async () => {
  const dismissal = deferred();
  ref.current!.respondWith(() => dismissal.promise);
  ref.current!.publish('sensor.washer_washer_machine_state', 'run');
  ref.current!.publish('sensor.washer_washer_job_state', 'wash');
  ref.current!.publish('sensor.dryer_dryer_machine_state', 'run');
  ref.current!.publish('sensor.dryer_dryer_job_state', 'drying');
  const reminder = (id: string, episode: string, title: string) => ({
    id, episode, title, detail: 'Cycle complete', tone: 'blue', icon: 'washer', target: 'appliances',
    kind: 'completion', occurred_at: new Date().toISOString(), snoozed_until: null, snooze_seconds: 3600,
  });
  const dryer = reminder('dryer-finished', 'dryer-1', 'Dryer finished');
  const washer = reminder('washer-finished', 'washer-1', 'Washer finished');
  ref.current!.publish('sensor.dashboard_attention', '2', { ready: true, items: [washer, dryer] });
  render(<CanvasDashboard />);
  expect(screen.getByRole('button', { name: /Washer.*Washing/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Dryer.*Drying/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'View: Washer finished' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done: Washer finished' }));
  expect(ref.current!.calls).toContainEqual(expect.objectContaining({
    service: 'dismiss', service_data: { id: 'washer-finished', episode: 'washer-1' },
  }));
  act(() => ref.current!.publish('sensor.washer_washer_job_state', 'finished'));
  expect(screen.getByRole('button', { name: /Washer.*Finished/ })).toBeTruthy();
  act(() => {
    ref.current!.publish('sensor.washer_washer_job_state', 'wash');
    ref.current!.publish('sensor.dashboard_attention', '2', {
      ready: true, items: [reminder('washer-finished', 'washer-2', 'Washer finished again'), dryer],
    });
  });
  expect(screen.getByRole('button', { name: /Washer.*Washing/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'View: Washer finished again' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'View: Dryer finished' })).toBeTruthy();
  await act(async () => dismissal.resolve({}));
  expect(screen.getByRole('button', { name: 'View: Washer finished again' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'View: Dryer finished' })).toBeTruthy();
});

it('keeps mood selection, End, and recovery retry available on the overview', async () => {
  ref.current!.publish('sensor.house_mood', 'active', { active_mood: 'love' });
  render(<CanvasDashboard />);
  for (const name of ['Love', 'Unwind', 'Dinner', 'Party', 'Gym'])
    expect(screen.getByRole('button', { name: `${name} mood` })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'End mood' }));
  expect(ref.current!.calls).toContainEqual(expect.objectContaining({ domain: 'house_moods', service: 'end' }));
  expect(screen.queryByRole('button', { name: 'Explore moods' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Mood details' })).toBeNull();
  expect(screen.queryByText('House mood is on')).toBeNull();
  act(() =>
    ref.current!.publish('sensor.house_mood', 'recovery_required', { errors: [{ target: 'lamp', message: 'Could not restore lamp' }] })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry restoration' }));
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
  fireEvent.click(within(gym).getByRole('button', { name: 'Stop recently requested blinds in Bedroom' }));
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

it('shows an unavailable Roomba as uncertain and sends no command from read-only navigation', () => {
  ref.current!.publish('vacuum.roomba', 'unavailable', { supported_features: 8192 | 4 | 16 });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roomba' }));
  const detail = within(screen.getByRole('dialog', { name: 'Roomba' }));
  expect(detail.getByText('Reconnect or wait for a reliable Roomba state to use controls.')).toBeTruthy();
  expect(detail.queryByRole('button', { name: 'Start cleaning' })).toBeNull();
  expect(detail.queryByRole('button', { name: 'Pause cleaning' })).toBeNull();
  expect(detail.queryByRole('button', { name: 'Return to dock' })).toBeNull();
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

it('retains a pending Roomba command and its later rejection after closing and reopening details', async () => {
  const starting = deferred();
  ref.current!.publish('vacuum.roomba', 'docked', { supported_features: 8192 });
  ref.current!.respondWith(() => starting.promise);
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roomba' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start cleaning' }));
  expect(ref.current!.calls).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roomba' }));
  expect(screen.getByRole('button', { name: 'Start cleaning' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Start cleaning' }));
  expect(ref.current!.calls).toHaveLength(1);
  await act(async () => starting.reject(new Error('Vacuum rejected')));
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('Vacuum rejected');
});

it('retains Roomba observation after reopening a pending detail', async () => {
  const starting = deferred();
  ref.current!.publish('vacuum.roomba', 'docked', { supported_features: 8192 });
  ref.current!.respondWith(() => starting.promise);
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roomba' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start cleaning' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Roomba' }));
  await act(async () => starting.resolve({}));
  expect(screen.getByText(/Service accepted; device response is not yet verified/)).toBeTruthy();
  act(() => ref.current!.publish('vacuum.roomba', 'cleaning', { supported_features: 8192 }));
  expect(screen.getByText('Roomba reported the requested state.')).toBeTruthy();
  expect(ref.current!.calls).toHaveLength(1);
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

function openThermostats() {
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thermostats' }));
}
const thermostatAttrs = {
  temperature: 20,
  current_temperature: 19,
  min_temp: 19,
  max_temp: 22,
  target_temp_step: 1,
  supported_features: 1,
  hvac_action: 'heating',
};
it.each(['rejected', 'observed'])('retains thermostat lock across close/reopen and a later %s outcome', async outcome => {
  const change = deferred();
  ref.current!.publish('climate.thermostat_office', 'heat', thermostatAttrs);
  ref.current!.respondWith(() => change.promise);
  render(<CanvasDashboard />);
  openThermostats();
  fireEvent.click(screen.getByRole('button', { name: 'Raise Office target temperature' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  openThermostats();
  expect(screen.getByRole('button', { name: 'Raise Office target temperature' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Raise Office target temperature' }));
  expect(ref.current!.calls).toHaveLength(1);
  if (outcome === 'rejected') {
    await act(async () => change.reject(new Error('Thermostat denied')));
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('Thermostat denied');
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    openThermostats();
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('Thermostat denied');
  } else {
    await act(async () => change.resolve({}));
    expect(screen.getByRole('button', { name: 'Raise Office target temperature' }).hasAttribute('disabled')).toBe(true);
    await act(async () => ref.current!.publish('climate.thermostat_office', 'heat', { ...thermostatAttrs, temperature: 21 }));
    expect(screen.getByRole('button', { name: 'Raise Office target temperature' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByLabelText('Office target temperature').textContent).toBe('21°');
  }
  expect(ref.current!.calls).toHaveLength(1);
});

it.each(['completion', 'condition'])('shows pending, rejection and timeout for %s reminder inside its dialog', async kind => {
  vi.useFakeTimers();
  try {
    const action = deferred();
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
          kind,
          occurred_at: new Date().toISOString(),
          snoozed_until: null,
          snooze_seconds: 3600,
        },
      ],
    });
    ref.current!.respondWith(() => action.promise);
    render(<CanvasDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'View: Empty Roomba bin' }));
    const dialog = within(screen.getByRole('dialog'));
    const button = dialog.getByRole('button', { name: `${kind === 'completion' ? 'Done' : 'Snooze'}: Empty Roomba bin` });
    fireEvent.click(button);
    expect(dialog.getByText('Saving reminder…').getAttribute('role')).toBe('status');
    expect(button.hasAttribute('disabled')).toBe(true);
    await act(async () => action.reject(new Error('Denied')));
    expect(dialog.getByRole('alert').textContent).toContain('Could not save this reminder');
    ref.current!.respondWith(() => new Promise(() => {}));
    fireEvent.click(button);
    await act(async () => vi.advanceTimersByTime(15000));
    expect(dialog.getByRole('alert').textContent).toContain('Could not save this reminder');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(ref.current!.calls).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
});

it.each(['activate', 'end'])('shows overview mood %s uncertainty and keeps its no-resend lock', async service => {
  vi.useFakeTimers();
  try {
    ref.current!.publish('sensor.house_mood', service === 'end' ? 'active' : 'idle', service === 'end' ? { active_mood: 'love' } : {});
    ref.current!.respondWith(() => new Promise(() => {}));
    render(<CanvasDashboard />);
    const name = service === 'end' ? 'End mood' : 'Love mood';
    fireEvent.click(screen.getByRole('button', { name }));
    await act(async () => vi.advanceTimersByTime(35000));
    expect(screen.getByRole('alert').textContent).toContain('Waiting for Home Assistant to confirm the change.');
    fireEvent.click(screen.getByRole('button', { name }));
    expect(ref.current!.calls).toHaveLength(1);
    expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Mood details' })).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
it('shows a terminal mood rejection with its full explanation on the overview', async () => {
  ref.current!.publish('sensor.house_mood', 'idle');
  ref.current!.respondWith(() =>
    Promise.resolve({ response: { success: false, phase: 'idle', errors: [{ target: 'lamp', message: 'Lamp rejected activation' }] } })
  );
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Love mood' }));
  await act(async () => {});
  expect(screen.getByRole('alert').textContent).toContain('Lamp rejected activation');
  expect(screen.queryByRole('button', { name: 'Mood details' })).toBeNull();
});

it('retains thermostat disconnect uncertainty across navigation and never replays on reconnect', async () => {
  ref.current!.publish('climate.thermostat_office', 'heat', thermostatAttrs);
  ref.current!.respondWith(() => new Promise(() => {}));
  render(<CanvasDashboard />);
  openThermostats();
  fireEvent.click(screen.getByRole('button', { name: 'Raise Office target temperature' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  await act(async () => ref.current!.disconnect());
  await act(async () => ref.current!.reconnect());
  openThermostats();
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('Connection changed while waiting');
  expect(ref.current!.calls).toHaveLength(1);
});
it('uses thermostat bounds, supported features and reported availability independently per room', () => {
  ref.current!.publish('climate.thermostat_office', 'heat', { ...thermostatAttrs, temperature: 22 });
  ref.current!.publish('climate.thermostat_gym', 'heat', { ...thermostatAttrs, supported_features: 0 });
  ref.current!.publish('climate.thermostat_bedroom', 'unavailable', thermostatAttrs);
  render(<CanvasDashboard />);
  openThermostats();
  expect(screen.getByRole('button', { name: 'Raise Office target temperature' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Lower Office target temperature' }).hasAttribute('disabled')).toBe(false);
  for (const room of ['Gym', 'Bedroom'])
    for (const verb of ['Raise', 'Lower'])
      expect(screen.getByRole('button', { name: `${verb} ${room} target temperature` }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Lower Office target temperature' }));
  expect(ref.current!.calls).toEqual([
    expect.objectContaining({ target: { entity_id: ['climate.thermostat_office'] }, service_data: { temperature: 21 } }),
  ]);
});

it('honours fractional thermostat steps while off and unsupported rooms remain read-only', () => {
  ref.current!.publish('climate.thermostat_office', 'heat', { ...thermostatAttrs, temperature: 20.25, target_temp_step: 0.25 });
  ref.current!.publish('climate.thermostat_gym', 'off', { ...thermostatAttrs, supported_features: 1 });
  ref.current!.publish('climate.thermostat_bedroom', 'heat', { ...thermostatAttrs, supported_features: 0 });
  render(<CanvasDashboard />);
  openThermostats();
  expect(ref.current!.calls).toHaveLength(0);
  for (const room of ['Gym', 'Bedroom'])
    expect(screen.getByRole('button', { name: `Raise ${room} target temperature` }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Raise Office target temperature' }));
  expect(ref.current!.calls).toEqual([expect.objectContaining({
    domain: 'climate', service: 'set_temperature', target: { entity_id: ['climate.thermostat_office'] },
    service_data: { temperature: 20.5 },
  })]);
});

it('restores the chosen snoozed episode from the contained pulse row and locks restores while saving', async () => {
  const restore = deferred();
  ref.current!.respondWith(() => restore.promise);
  ref.current!.publish('sensor.dashboard_attention', '3', {
    ready: true,
    items: ['First reminder', 'Second reminder with a long title', 'Third reminder'].map((title, index) => ({
      id: `reminder-${index}`,
      episode: `episode-${index}`,
      title,
      detail: 'Snoozed',
      tone: 'amber',
      icon: 'bin',
      target: 'vacuum',
      kind: 'condition',
      occurred_at: new Date().toISOString(),
      snoozed_until: new Date(Date.now() + 3600000).toISOString(),
      snooze_seconds: 3600,
    })),
  });
  render(<CanvasDashboard />);
  const toggle = screen.getByRole('button', { name: 'Snoozed · 3' });
  expect(screen.queryByRole('button', { name: 'Restore: First reminder' })).toBeNull();
  fireEvent.click(toggle);
  const chosen = screen.getByRole('button', { name: 'Restore: Second reminder with a long title' });
  expect(chosen.parentElement).toBe(toggle.parentElement);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(chosen);
  expect(ref.current!.calls).toEqual([
    expect.objectContaining({
      domain: 'dashboard_attention',
      service: 'unsnooze',
      service_data: { id: 'reminder-1', episode: 'episode-1' },
    }),
  ]);
  expect(screen.getByRole('button', { name: 'Restore: First reminder' }).hasAttribute('disabled')).toBe(true);
  await act(async () => restore.resolve({}));
  fireEvent.click(toggle);
  expect(screen.queryByRole('button', { name: 'Restore: First reminder' })).toBeNull();
});

it('restores a searched directory position and trigger focus after nested navigation', () => {
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a device or room' }), { target: { value: 'Bedroom' } });
  const body = document.querySelector('.canvas-dialog__body')!;
  body.scrollTop = 260;
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bedroom blinds' }));
  expect(body.scrollTop).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(body.scrollTop).toBe(260);
  expect((screen.getByRole('searchbox', { name: 'Find a device or room' }) as HTMLInputElement).value).toBe('Bedroom');
  expect(document.activeElement).toBe(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bedroom blinds' }));
});

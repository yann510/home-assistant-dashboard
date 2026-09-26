// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasDashboard } from './CanvasDashboard';
import { createHaFixture } from './testing/haFixture';

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
vi.mock('../Dashboard', () => ({ default: () => <div>Classic dashboard</div> }));
vi.mock('../QuietHome', () => ({ QuietHome: () => <div>Quiet dashboard</div> }));
const fixture = createHaFixture();
fixtureRef.current = fixture;

afterEach(() => {
  cleanup();
  fixture.reset();
});

it('restores the directory trigger on Back, traps keyboard focus, and restores overview focus on Escape', () => {
  render(<CanvasDashboard />);
  const overview = screen.getByRole('button', { name: 'All devices' });
  fireEvent.click(overview);
  const trigger = screen.getByRole('button', { name: 'Weather' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Weather' }));
  const dialog = screen.getByRole('dialog');
  const close = screen.getByRole('button', { name: 'Close details' });
  close.focus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(document.activeElement).not.toBe(close);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(document.activeElement).toBe(overview);
});

function speaker() {
  fixture.publish('media_player.living_room', 'playing', {
    friendly_name: 'Living room',
    volume_level: 0.32,
    supported_features: 4127295,
    media_title: 'A real track',
    media_artist: 'An artist',
    media_duration: 200,
    media_position: 20,
    group_members: ['media_player.living_room'],
  });
}

it('opens every directory destination with one modal owner and returns to the searched trigger', async () => {
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  for (const name of ['All lights', 'Blinds', 'Player', 'Speakers', 'Weather', 'Thermostats', 'Appliances', 'Roomba']) {
    const button = within(screen.getByRole('dialog')).getByRole('button', { name });
    fireEvent.click(button);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(document.activeElement).toBe(within(screen.getByRole('dialog')).getByRole('button', { name }));
  }
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Office thermostat' } });
  const thermostat = screen.getByRole('button', { name: 'Office thermostat' });
  screen.getByRole('searchbox').focus();
  fireEvent.click(thermostat);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Office thermostat');
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Office thermostat' }));
  await act(async () => {});
  expect(fixture.calls.filter(call => (call as { type: string }).type === 'call_service')).toHaveLength(0);
});

it('retains speaker slider identity and focus across entity updates and Player/Speakers roundtrips', async () => {
  speaker();
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
  const slider = screen.getByRole('slider', { name: 'Group volume' });
  slider.focus();
  act(() =>
    fixture.publish('media_player.living_room', 'playing', {
      ...fixture.getState().entities['media_player.living_room'].attributes,
      volume_level: 0.4,
    })
  );
  expect(document.activeElement).toBe(slider);
  expect(screen.getByRole('slider', { name: 'Group volume' })).toBe(slider);
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open player' }));
  expect(screen.getByRole('dialog', { name: 'Player' })).toBeTruthy();
  expect(within(screen.getByRole('dialog')).queryByRole('slider', { name: /volume/i })).toBeNull();
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
  expect((screen.getByRole('slider', { name: 'Group volume' }) as HTMLInputElement).value).toBe('40');
});

it('keeps offline detail access, disables commands, and never replays writes on reconnect', () => {
  speaker();
  fixture.disconnect();
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Open player' }));
  expect((within(screen.getByRole('dialog')).getByRole('button', { name: 'Pause' }) as HTMLButtonElement).disabled).toBe(true);
  act(() => fixture.reconnect());
  expect(fixture.calls.filter(call => (call as { type: string }).type === 'call_service')).toHaveLength(0);
});

it('recovers forecast failure through retry without replacing the dialog', async () => {
  fixture.publish('weather.forecast_home', 'sunny', { temperature: 18, supported_features: 3 });
  fixture.respondWith(async () => {
    throw new Error('Forecast unavailable');
  });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: /Weather.*18/ }));
  const dialog = screen.getByRole('dialog');
  await act(async () => {});
  expect(within(dialog).getByRole('alert')).toBeTruthy();
  fixture.respondWith(async () => ({
    forecast: [{ datetime: new Date(Date.now() + 3600000).toISOString(), temperature: 19, condition: 'rainy' }],
  }));
  fireEvent.click(within(dialog).getByRole('button', { name: /Retry/ }));
  await act(async () => {});
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(within(dialog).getByText('19°C')).toBeTruthy();
});

it('shows partial all-light failure by friendly name and opens individual details without losing outcomes', async () => {
  fixture.publish('light.light_living_room_bulbs', 'on', { friendly_name: 'Living bulbs' });
  fixture.publish('light.living_room_led_strip', 'on', { friendly_name: 'Sofa strip' });
  fixture.respondWith(async message => {
    const id = (message as { target: { entity_id: string[] } }).target.entity_id[0];
    if (id === 'light.living_room_led_strip') throw new Error('Light did not respond');
    fixture.publish(id, 'off', { friendly_name: 'Living bulbs' });
    return {};
  });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All lights' }));
  fireEvent.click(screen.getByRole('button', { name: 'Turn off all lights' }));
  await act(async () => {});
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('Sofa strip:');
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).not.toContain('light.living_room');
  const lightTrigger = screen.getByRole('button', { name: 'Sofa strip' });
  fireEvent.click(lightTrigger);
  act(() => fixture.publish('light.living_room_led_strip', 'off', { friendly_name: 'Sofa strip' }));
  expect(screen.getByRole('dialog', { name: 'Light' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('Sofa strip:');
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sofa strip' }));
});

it('captures selected blinds and retries only the failed room after a detail roundtrip', async () => {
  fixture.respondWith(async message => {
    if ((message as { service_data: { command: string } }).service_data.command.includes('bedroom')) throw new Error('Bedroom unavailable');
    return {};
  });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Gym blinds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  await act(async () => {});
  expect(fixture.calls).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(screen.getByRole('button', { name: 'Blinds' }));
  fixture.respondWith(async () => ({}));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retry Open for failed rooms' }));
  await act(async () => {});
  expect(fixture.calls).toHaveLength(3);
  expect(fixture.calls[2]).toMatchObject({ service_data: { command: 'open all the blinds bedroom' } });
});

it('shows mood attention and recovery actions on the card without opening details', async () => {
  fixture.publish('sensor.house_mood', 'recovery_required', {
    active_mood: 'unwind',
    errors: [{ target: 'Living room', message: 'Restoration failed' }],
  });
  fixture.publish('sensor.dashboard_attention', '1', {
    ready: true,
    items: [
      {
        id: 'mood',
        episode: 'mood-1',
        title: 'Restore your home',
        detail: 'Mood needs recovery',
        tone: 'amber',
        icon: 'mood',
        target: 'mood',
        kind: 'condition',
        occurred_at: new Date().toISOString(),
        snoozed_until: null,
        snooze_seconds: 3600,
      },
    ],
  });
  fixture.respondWith(async () => ({ response: { success: true, phase: 'idle' } }));
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'View: Restore your home' }));
  const card = screen.getByRole('region', { name: 'House Mood' });
  expect(within(card).getByText('Mood needs recovery')).toBeTruthy();
  expect(within(card).getByText('Restoration failed')).toBeTruthy();
  expect(within(card).getByRole('button', { name: 'Snooze reminder' })).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'House Mood' })).toBeNull();
  fireEvent.click(within(card).getByRole('button', { name: 'Retry restoration' }));
  await act(async () => {});
  expect(within(card).getByText('No mood active')).toBeTruthy();
  fireEvent.click(within(card).getByRole('button', { name: 'Snooze reminder' }));
  expect(fixture.calls).toContainEqual(
    expect.objectContaining({ domain: 'dashboard_attention', service: 'snooze', service_data: { id: 'mood', episode: 'mood-1' } })
  );
  expect(within(card).getByText('Mood needs recovery')).toBeTruthy();
  act(() => fixture.publish('sensor.dashboard_attention', '1', { ready: true, items: [] }));
  expect(within(card).queryByText('Mood needs recovery')).toBeNull();
});

it('dismisses a completed mood notice from the card', () => {
  fixture.publish('sensor.dashboard_attention', '1', {
    ready: true,
    items: [
      {
        id: 'mood-complete',
        episode: 'mood-complete-1',
        title: 'Mood finished',
        detail: 'The room is ready',
        tone: 'amber',
        icon: 'mood',
        target: 'mood',
        kind: 'completion',
        occurred_at: new Date().toISOString(),
        snoozed_until: null,
        snooze_seconds: 3600,
      },
    ],
  });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'View: Mood finished' }));
  const card = screen.getByRole('region', { name: 'House Mood' });
  fireEvent.click(within(card).getByRole('button', { name: 'Done' }));
  expect(fixture.calls).toContainEqual(
    expect.objectContaining({ domain: 'dashboard_attention', service: 'dismiss', service_data: { id: 'mood-complete', episode: 'mood-complete-1' } })
  );
  expect(within(card).getByText('The room is ready')).toBeTruthy();
  act(() => fixture.publish('sensor.dashboard_attention', '1', { ready: true, items: [] }));
  expect(within(card).queryByText('The room is ready')).toBeNull();
});

it('labels favourites without artwork and surfaces a playback rejection in Player', async () => {
  speaker();
  fixture.respondWith(async message => {
    if ((message as { type: string }).type === 'media_player/browse_media')
      return { children: [{ title: 'Morning calm', can_play: true, media_content_id: 'calm', media_content_type: 'playlist' }] };
    throw new Error('Playback rejected');
  });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Open player' }));
  await act(async () => {});
  const playlist = screen.getByRole('button', { name: 'Play Morning calm' });
  expect(playlist.textContent).toContain('Morning calm');
  fireEvent.click(playlist);
  await act(async () => {});
  expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toMatch(/Could not|Playback rejected/);
});

it('adjusts overview volume through the shared speaker control without opening a modal', async () => {
  speaker();
  fixture.respondWith(async () => {
    fixture.publish('media_player.living_room', 'playing', {
      ...fixture.getState().entities['media_player.living_room'].attributes,
      volume_level: 0.34,
    });
    return {};
  });
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'Raise volume' }));
  await act(async () => {});
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fixture.calls).toContainEqual(
    expect.objectContaining({ domain: 'media_player', service: 'volume_set', service_data: { volume_level: 0.34 } })
  );
  expect(screen.getByRole('button', { name: 'Open speaker volume' }).textContent).toBe('34%');
});

it.each(['Open player', 'Open speakers', 'Open speaker volume', 'All lights'])(
  'restores the actual %s pointer trigger without pre-focusing it',
  async name => {
    speaker();
    render(<CanvasDashboard />);
    const trigger = screen.getByRole('button', { name });
    expect(document.activeElement).not.toBe(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(document.activeElement).toBe(trigger);
    await act(async () => {});
  }
);

it('restores an unfocused weather trigger and an attention chip after updated labels', async () => {
  fixture.publish('weather.forecast_home', 'sunny', { temperature: 18, supported_features: 3 });
  fixture.publish('sensor.dashboard_attention', '1', {
    ready: true,
    items: [
      {
        id: 'bin',
        episode: 'bin-1',
        title: 'Empty bin',
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
  const weather = screen.getByRole('button', { name: /Weather.*18/ });
  fireEvent.click(weather);
  act(() => fixture.publish('weather.forecast_home', 'rainy', { temperature: 19, supported_features: 3 }));
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  expect(document.activeElement).toBe(weather);
  const chip = screen.getByRole('button', { name: 'View: Empty bin' });
  fireEvent.click(chip);
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  expect(document.activeElement).toBe(chip);
  await act(async () => {});
});

it('restores an activity trigger without relying on focus and keeps directory identity across renamed telemetry', () => {
  fixture.publish('sensor.washer_washer_machine_state', 'run');
  fixture.publish('sensor.washer_washer_job_state', 'wash');
  fixture.publish('light.light_living_room_bulbs', 'on', { friendly_name: 'First name' });
  render(<CanvasDashboard />);
  const activity = screen.getByRole('button', { name: /Washer.*Washing/ });
  fireEvent.click(activity);
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  expect(document.activeElement).toBe(activity);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  fireEvent.click(screen.getByRole('button', { name: 'Living Room · First name' }));
  act(() => fixture.publish('light.light_living_room_bulbs', 'off', { friendly_name: 'Renamed light' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Living Room · Renamed light' }));
});

it.each(['Washer', 'Dryer'])('restores the distinct %s directory trigger while both laundry destinations are visible', name => {
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  const directory = within(screen.getByRole('dialog'));
  expect(directory.getByRole('button', { name: 'Washer' })).toBeTruthy();
  expect(directory.getByRole('button', { name: 'Dryer' })).toBeTruthy();
  const trigger = directory.getByRole('button', { name });
  expect(document.activeElement).not.toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(document.activeElement).toBe(within(screen.getByRole('dialog')).getByRole('button', { name }));
});

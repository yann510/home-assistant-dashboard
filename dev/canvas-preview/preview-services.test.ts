import { expect, it } from 'vitest';
import type { HassEntities } from 'home-assistant-js-websocket';
import { applyPreviewService, previewFailures } from './preview-services';

function fixture(): HassEntities {
  const states: Record<string, [string, Record<string, unknown>]> = {
    'sensor.house_mood': ['active', { active_mood: 'unwind', mode_control: 'coordinated-v1' }],
    'input_boolean.morning_mode': ['on', {}],
    'input_boolean.night_mode': ['off', {}],
    'input_boolean.speaker_follow_motion': ['off', {}],
    'input_text.speaker_follow_source': ['', {}],
    'script.speaker_follow_motion': ['off', {}],
    'media_player.living_room': [
      'playing',
      { group_members: ['media_player.living_room'], media_content_id: 'fixture:0', media_title: 'First song', media_position: 40 },
    ],
    'media_player.gym': ['idle', { group_members: ['media_player.gym'] }],
    'vacuum.roomba': ['docked', { fan_speed: 'Balanced' }],
    'light.office': ['on', { supported_color_modes: ['color_temp'], brightness: 166 }],
    'climate.office': ['heat', { temperature: 22, min_temp: 5, max_temp: 30 }],
    'sensor.dashboard_attention': ['1', { ready: true, items: [{ id: 'bin', episode: 'bin1', snoozed_until: null, snooze_seconds: 600 }] }],
  };
  return Object.fromEntries(
    Object.entries(states).map(([id, [state, attributes]]) => [
      id,
      {
        entity_id: id,
        state,
        attributes,
        last_changed: '',
        last_updated: '',
        context: { id: 'preview', parent_id: null, user_id: null },
      },
    ])
  );
}
const call = (domain: string, service: string, id?: string, data = {}) => ({
  type: 'call_service',
  domain,
  service,
  target: { entity_id: id },
  service_data: data,
});
it('keeps busy and recovery interactive and limits fault injection to explicit selections', () => {
  for (const scene of ['everyday', 'busy', 'mood-recovery'])
    expect(previewFailures(new URLSearchParams({ scene }))).toEqual({ commands: false, forecast: false });
  expect(previewFailures(new URLSearchParams('scene=failure'))).toEqual({ commands: true, forecast: true });
  expect(previewFailures(new URLSearchParams('scene=busy&fail=forecast'))).toEqual({ commands: false, forecast: true });
});
it('advances grouped tracks and favourites, then follows and cleans up the group', () => {
  let state = fixture();
  state['media_player.living_room'].attributes.entity_picture = '/preview-cover.jpg';
  const run = (message: Record<string, unknown>) => {
    state = { ...state, ...applyPreviewService(state, message).updates };
  };
  run(call('media_player', 'join', 'media_player.living_room', { group_members: ['media_player.gym'] }));
  expect(state['media_player.gym'].attributes.entity_picture).toBe('/preview-cover.jpg');
  run(call('media_player', 'media_next_track', 'media_player.living_room'));
  expect(state['media_player.gym'].attributes.media_content_id).toBe('fixture:1');
  run(call('media_player', 'media_previous_track', 'media_player.living_room'));
  expect(state['media_player.gym'].attributes.media_content_id).toBe('fixture:0');
  run(call('media_player', 'play_media', 'media_player.living_room', { media_content_id: 'fixture:2' }));
  expect(state['media_player.gym'].attributes.media_title).toBe('Cozy Dinner Mix');
  run(call('script', 'speaker_follow_motion', undefined, { command: 'enable', source_entity: 'media_player.living_room' }));
  expect(state['input_boolean.speaker_follow_motion'].state).toBe('on');
  expect(state['input_text.speaker_follow_source'].state).toBe('media_player.living_room');
  run(call('script', 'speaker_follow_motion', undefined, { command: 'disable' }));
  expect(state['input_text.speaker_follow_source'].state).toBe('');
  expect(state['media_player.gym'].state).toBe('idle');
  expect(state['media_player.living_room'].state).toBe('playing');
  expect(state['media_player.living_room'].attributes.group_members).toEqual(['media_player.living_room']);
});
it('supports transfer playback of a non-favourite reported queue', () => {
  const state = fixture();
  state['media_player.living_room'].attributes = {
    ...state['media_player.living_room'].attributes,
    media_content_id: 'custom:queue',
    media_title: 'User queue',
  };
  const result = applyPreviewService(state, call('media_player', 'play_media', 'media_player.gym', { media_content_id: 'custom:queue' }));
  expect(result.updates['media_player.gym'].attributes.media_title).toBe('User queue');
});
it('reports vacuum actions and fan changes without fabricating locate telemetry', () => {
  let state = fixture();
  for (const [service, expected] of [
    ['start', 'cleaning'],
    ['pause', 'paused'],
    ['stop', 'idle'],
    ['return_to_base', 'docked'],
  ]) {
    state = { ...state, ...applyPreviewService(state, call('vacuum', service, 'vacuum.roomba')).updates };
    expect(state['vacuum.roomba'].state).toBe(expected);
  }
  const speed = applyPreviewService(state, call('vacuum', 'set_fan_speed', 'vacuum.roomba', { fan_speed: 'Quiet' }));
  expect(speed.updates['vacuum.roomba'].attributes.fan_speed).toBe('Quiet');
  expect(applyPreviewService(state, call('vacuum', 'locate', 'vacuum.roomba')).updates['vacuum.roomba'].state).toBe('docked');
});
it('updates light settings, thermostat targets, and mood restoration', () => {
  const state = fixture();
  const light = applyPreviewService(state, call('light', 'turn_on', 'light.office', { brightness: 120, color_temp_kelvin: 3200 }));
  expect(light.updates['light.office'].attributes).toMatchObject({ brightness: 120, color_temp_kelvin: 3200, color_mode: 'color_temp' });
  expect(
    applyPreviewService(state, call('climate', 'set_temperature', 'climate.office', { temperature: 23 })).updates['climate.office']
      .attributes.temperature
  ).toBe(23);
  const mode = applyPreviewService(state, call('house_moods', 'apply_mode', undefined, { mode: 'night' }));
  expect(mode.updates['sensor.house_mood'].state).toBe('idle');
  expect(mode.updates['input_boolean.night_mode'].state).toBe('on');
  state['sensor.house_mood'].state = 'recovery_required';
  expect(applyPreviewService(state, call('house_moods', 'retry_restoration')).updates['sensor.house_mood'].state).toBe('idle');
});
it('snoozes, unsnoozes and dismisses matching reminder episodes only', () => {
  let state = fixture();
  const action = (service: string, episode = 'bin1') => {
    state = { ...state, ...applyPreviewService(state, call('dashboard_attention', service, undefined, { id: 'bin', episode })).updates };
  };
  action('snooze');
  expect(state['sensor.dashboard_attention'].attributes.items[0].snoozed_until).toBeTruthy();
  action('unsnooze');
  expect(state['sensor.dashboard_attention'].attributes.items[0].snoozed_until).toBeNull();
  action('dismiss', 'stale');
  expect(state['sensor.dashboard_attention'].attributes.items).toHaveLength(1);
  action('dismiss');
  expect(state['sensor.dashboard_attention'].attributes.items).toHaveLength(0);
});
it('accepts blind commands without inventing positions, preserves unconfirmed state and rejects unknown actions', () => {
  const state = fixture();
  expect(
    applyPreviewService(state, call('google_assistant_sdk', 'send_text_command', undefined, { command: 'open all the blinds gym' })).updates
  ).toEqual(state);
  expect(
    applyPreviewService(state, call('dashboard_attention', 'unsnooze', undefined, { id: 'bin', episode: 'bin1' }), true).updates
  ).toEqual({});
  expect(() => applyPreviewService(state, call('vacuum', 'explode'))).toThrow('Unknown preview');
  expect(state['vacuum.roomba'].state).toBe('docked');
});

it('clears Follow me source through the manual room-grouping helper command', () => {
  const state = fixture();
  state['input_text.speaker_follow_source'].state = 'media_player.living_room';
  const result = applyPreviewService(state, call('input_text', 'set_value', 'input_text.speaker_follow_source', { value: '' }));
  expect(result.updates['input_text.speaker_follow_source'].state).toBe('');
});

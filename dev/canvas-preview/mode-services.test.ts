import { expect, it } from 'vitest';
import type { HassEntities } from 'home-assistant-js-websocket';
import { applyMoodService } from './mode-services';
const entities = {
  'sensor.house_mood': { entity_id: 'sensor.house_mood', state: 'active', attributes: { active_mood: 'love', mode_control: 'coordinated-v1' } },
  'input_boolean.morning_mode': { entity_id: 'input_boolean.morning_mode', state: 'off', attributes: {} },
  'input_boolean.night_mode': { entity_id: 'input_boolean.night_mode', state: 'on', attributes: {} },
} as unknown as HassEntities;
it('simulates same-state Night superseding a mood with response-only acceptance', () => {
  const result = applyMoodService(entities, { type: 'call_service', domain: 'house_moods', service: 'apply_mode', service_data: { mode: 'night' } })!;
  expect(result.response).toMatchObject({ success: true, phase: 'idle', mode_result: 'accepted' });
  expect(result.updates['sensor.house_mood'].attributes.active_mood).toBeNull();
  expect(result.updates['input_boolean.night_mode'].state).toBe('on');
  expect(entities['sensor.house_mood'].state).toBe('active');
});
it.each(['love', 'unwind', 'dinner', 'party', 'gym'])('keeps Night unchanged for %s activation', mood => {
  const result = applyMoodService(entities, { type: 'call_service', domain: 'house_moods', service: 'activate', service_data: { mood } })!;
  expect(result.response).toMatchObject({ success: true, phase: 'active', active_mood: mood });
  expect(Object.keys(result.updates)).toEqual(['sensor.house_mood']);
});

import type { HassEntities } from 'home-assistant-js-websocket';

/** UI-only routine simulator. Real brightness/journaling is tested in Python. */
export function applyMoodService(entities: HassEntities, message: Record<string, unknown>) {
  if (message.type !== 'call_service' || message.domain !== 'house_moods') return null;
  const sensor = entities['sensor.house_mood'];
  if (!sensor) return { updates: {}, response: { success: false, phase: 'idle', errors: [{ message: 'Mood status is missing.' }] } };
  const service = message.service;
  const data = message.service_data as { mode?: string; mood?: string } | undefined;
  const blocked = ['starting', 'restoring', 'recovery_required'].includes(sensor.state) && service !== 'retry_restoration';
  if (blocked) return { updates: {}, response: { success: false, phase: sensor.state, errors: [{ message: 'Finish the current operation or recovery.' }] } };
  const updates: HassEntities = {};
  const phase = service === 'activate' ? 'active' : 'idle';
  const active = service === 'activate' ? data?.mood : null;
  if (service === 'activate' && !['love', 'unwind', 'dinner', 'party', 'gym'].includes(active ?? '')) return null;
  if (!['activate', 'end', 'retry_restoration', 'apply_mode'].includes(String(service))) return null;
  if (service === 'apply_mode') {
    if (data?.mode !== 'day' && data?.mode !== 'night') return null;
    const day = entities['input_boolean.morning_mode'];
    const night = entities['input_boolean.night_mode'];
    if (!day || !night) return { updates: {}, response: { success: false, phase: sensor.state, errors: [{ message: 'Both mode helpers are required.' }] } };
    updates[day.entity_id] = { ...day, state: data.mode === 'day' ? 'on' : 'off' };
    updates[night.entity_id] = { ...night, state: data.mode === 'night' ? 'on' : 'off' };
  }
  updates[sensor.entity_id] = { ...sensor, state: phase, attributes: { ...sensor.attributes, active_mood: active, pending_mood: null, errors: [] } };
  return { updates, response: { success: true, phase, active_mood: active, ...(service === 'apply_mode' ? { mode_result: 'accepted' } : {}) } };
}

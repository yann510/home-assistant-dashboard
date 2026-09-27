import type { HassEntities } from 'home-assistant-js-websocket';
import { applyMoodService } from './mode-services';
import { applySpeakerService } from './speaker-services';
import { previewFavourites } from './favourites';

export function previewFailures(params: URLSearchParams) {
  const fault = params.get('fail');
  const all = params.get('scene') === 'failure' || fault === 'all';
  return { commands: all || fault === 'commands', forecast: all || fault === 'forecast' };
}

/** Local state only: never opens a socket or calls a physical device. */
export function applyPreviewService(
  entities: HassEntities,
  message: Record<string, unknown>,
  unconfirmed = false
): { updates: HassEntities; response: Record<string, unknown> } {
  if (message.type !== 'call_service') throw new Error('Unsupported local preview request.');
  if (unconfirmed) return { updates: {}, response: { success: true } };
  const mood = applyMoodService(entities, message);
  if (mood) return mood;
  let next = { ...entities };
  const data = (message.service_data ?? {}) as Record<string, unknown>;
  const target = (message.target as { entity_id?: string | string[] } | undefined)?.entity_id ?? data.entity_id;
  const ids = (Array.isArray(target) ? target : typeof target === 'string' ? [target] : []).filter(
    (id): id is string => typeof id === 'string'
  );
  const service = String(message.service);
  const stamp = new Date().toISOString();
  const update = (id: string, state: string, attributes: Record<string, unknown> = {}) => {
    if (!next[id]) return;
    next[id] = {
      ...next[id],
      state,
      attributes: { ...next[id].attributes, ...attributes },
      last_updated: stamp,
      last_changed: next[id].state === state ? next[id].last_changed : stamp,
    };
  };
  const group = (id: string): string[] => {
    const members = next[id]?.attributes.group_members;
    return Array.isArray(members) && members.length ? members : [id];
  };
  const available = ids.filter(id => next[id] && !['unavailable', 'unknown'].includes(next[id].state));
  if (message.domain === 'media_player') {
    if (['media_next_track', 'media_previous_track', 'play_media'].includes(service)) {
      const touched = new Set<string>();
      for (const id of available) {
        if (touched.has(id)) continue;
        const current = next[id].attributes;
        const oldIndex = Number(String(current.media_content_id ?? 'fixture:0').split(':')[1]) || 0;
        const content =
          service === 'play_media'
            ? String(data.media_content_id ?? '')
            : `fixture:${(oldIndex + (service === 'media_next_track' ? 1 : previewFavourites.length - 1)) % previewFavourites.length}`;
        const favourite = previewFavourites.find((_, index) => content === `fixture:${index}`);
        const existing = Object.values(next).find(entity => entity.attributes.media_content_id === content);
        const audio = existing
          ? Object.fromEntries(Object.entries(existing.attributes).filter(([key]) => key.startsWith('media_') || key === 'entity_picture'))
          : {};
        for (const member of group(id)) {
          touched.add(member);
          update(member, 'playing', {
            ...audio,
            media_content_id: content,
            media_content_type: data.media_content_type ?? 'playlist',
            media_title: favourite?.title ?? audio.media_title ?? 'Preview audio',
            media_playlist: favourite?.title ?? audio.media_playlist,
            media_artist: favourite ? undefined : audio.media_artist,
            entity_picture: favourite?.thumbnail ?? audio.entity_picture,
            media_position: 0,
            media_duration: audio.media_duration ?? 240,
            media_position_updated_at: stamp,
          });
        }
      }
    } else if (['join', 'unjoin', 'volume_mute', 'volume_set', 'media_play', 'media_pause', 'media_seek'].includes(service)) {
      next = applySpeakerService(next, message) ?? next;
    } else throw new Error(`Unsupported preview media action: ${service}`);
  } else if (message.domain === 'script' && service === 'speaker_follow_motion') {
    if (data.command !== 'enable' && data.command !== 'disable') throw new Error('Unknown Follow me command.');
    const source = data.command === 'enable' ? String(data.source_entity) : next['input_text.speaker_follow_source']?.state;
    if (data.command === 'enable' && (!next[source] || ['unavailable', 'unknown'].includes(next[source].state)))
      throw new Error('Preview speaker unavailable.');
    if (data.command === 'disable' && source && next[source]) {
      for (const member of [...group(source)].filter(id => id !== source)) {
        next =
          applySpeakerService(next, { type: 'call_service', domain: 'media_player', service: 'unjoin', target: { entity_id: member } }) ??
          next;
      }
    }
    update('input_boolean.speaker_follow_motion', data.command === 'enable' ? 'on' : 'off');
    update('input_text.speaker_follow_source', data.command === 'enable' ? source : '');
    update('script.speaker_follow_motion', 'off');
  } else if (message.domain === 'vacuum') {
    const states: Record<string, string> = { start: 'cleaning', pause: 'paused', stop: 'idle', return_to_base: 'docked' };
    if (!(service in states) && !['locate', 'set_fan_speed'].includes(service)) throw new Error('Unknown preview vacuum action.');
    for (const id of available)
      update(id, states[service] ?? next[id].state, service === 'set_fan_speed' ? { fan_speed: data.fan_speed } : {});
  } else if (message.domain === 'climate' && service === 'set_temperature') {
    for (const id of available) {
      const attrs = next[id].attributes;
      if (typeof data.temperature === 'number' && Number.isFinite(data.temperature) && next[id].state !== 'off')
        update(id, next[id].state, { temperature: Math.max(attrs.min_temp ?? 5, Math.min(attrs.max_temp ?? 30, data.temperature)) });
    }
  } else if (message.domain === 'light' && ['turn_on', 'turn_off'].includes(service)) {
    for (const id of available) {
      const attrs = service === 'turn_on' ? { ...data } : {};
      if (attrs.rgb_color) attrs.color_mode = next[id].attributes.supported_color_modes?.includes('hs') ? 'hs' : 'rgb';
      if (attrs.color_temp_kelvin) attrs.color_mode = 'color_temp';
      update(id, service === 'turn_on' ? 'on' : 'off', attrs);
    }
  } else if (message.domain === 'input_boolean' && ['turn_on', 'turn_off', 'toggle'].includes(service)) {
    for (const id of available) update(id, service === 'turn_off' || (service === 'toggle' && next[id].state === 'on') ? 'off' : 'on');
  } else if (message.domain === 'input_text' && service === 'set_value') {
    for (const id of available) update(id, String(data.value ?? ''));
  } else if (message.domain === 'dashboard_attention' && ['dismiss', 'snooze', 'unsnooze'].includes(service)) {
    const sensor = next['sensor.dashboard_attention'];
    const items = (sensor?.attributes.items ?? []) as Array<Record<string, unknown>>;
    const matching = (item: Record<string, unknown>) => item.id === data.id && item.episode === data.episode;
    const revised =
      service === 'dismiss'
        ? items.filter(item => !matching(item))
        : items.map(item =>
            matching(item)
              ? {
                  ...item,
                  snoozed_until:
                    service === 'unsnooze' ? null : new Date(Date.now() + Number(item.snooze_seconds ?? 3600) * 1000).toISOString(),
                }
              : item
          );
    update('sensor.dashboard_attention', String(revised.filter(item => !item.snoozed_until).length), { items: revised });
  } else if (message.domain !== 'google_assistant_sdk' || service !== 'send_text_command') {
    throw new Error(`Unsupported local preview action: ${String(message.domain)}.${service}`);
  }
  // Blinds and locate are accepted commands; this simulator invents no position telemetry.
  return { updates: next, response: { success: true } };
}

import type { HassEntities } from 'home-assistant-js-websocket';

/** Apply local speaker commands so the preview behaves like device state updates. */
export function applySpeakerService(entities: HassEntities, message: Record<string, unknown>): HassEntities | null {
  if (message.type !== 'call_service' || message.domain !== 'media_player') return null;
  const target = (message.target as { entity_id?: string | string[] } | undefined)?.entity_id;
  const targets = (Array.isArray(target) ? target : target ? [target] : []).filter(id => entities[id]);
  const data = (message.service_data ?? {}) as Record<string, unknown>;
  const next = { ...entities };
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const update = (id: string, attributes: Record<string, unknown>, state = next[id]?.state) => {
    if (!next[id]) return;
    next[id] = { ...next[id], state, attributes: { ...next[id].attributes, ...attributes }, last_updated: timestamp };
  };
  const members = (id: string): string[] => {
    const group = next[id]?.attributes.group_members;
    return Array.isArray(group) && group.length ? group.filter(member => typeof member === 'string' && next[member]) : [id];
  };
  const position = (id: string): number | undefined => {
    const entity = next[id];
    const value = entity.attributes.media_position;
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    const updated = Date.parse(entity.attributes.media_position_updated_at ?? '');
    const elapsed = entity.state === 'playing' && Number.isFinite(updated) ? Math.max(0, (now - updated) / 1000) : 0;
    const duration = entity.attributes.media_duration;
    return Math.max(0, Math.min(typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : Infinity, value + elapsed));
  };
  const detach = (id: string) => {
    const remaining = members(id).filter(member => member !== id);
    remaining.forEach(member => update(member, { group_members: remaining }));
    update(
      id,
      { group_members: [id], media_title: undefined, media_artist: undefined, media_duration: undefined, media_position: undefined },
      'idle'
    );
  };

  if (message.service === 'join') {
    const source = targets[0];
    if (!source) return next;
    const joining = Array.isArray(data.group_members)
      ? data.group_members.filter((id): id is string => typeof id === 'string' && Boolean(next[id]) && id !== source)
      : [];
    joining.forEach(detach);
    const group = [...new Set([source, ...members(source), ...joining])];
    const audio = Object.fromEntries(Object.entries(next[source].attributes).filter(([key]) => key.startsWith('media_')));
    group.forEach(id => update(id, { ...audio, group_members: group }, next[source].state));
  } else if (message.service === 'unjoin') {
    targets.forEach(detach);
  } else {
    for (const id of targets) {
      switch (message.service) {
        case 'volume_mute':
          if (typeof data.is_volume_muted === 'boolean') update(id, { is_volume_muted: data.is_volume_muted });
          break;
        case 'volume_set':
          if (typeof data.volume_level === 'number' && Number.isFinite(data.volume_level))
            update(id, { volume_level: Math.max(0, Math.min(1, data.volume_level)) });
          break;
        case 'media_play':
        case 'media_pause':
          members(id).forEach(member => update(member, {
            media_position: position(member),
            media_position_updated_at: timestamp,
          }, message.service === 'media_play' ? 'playing' : 'paused'));
          break;
        case 'media_seek':
          if (typeof data.seek_position === 'number' && Number.isFinite(data.seek_position)) {
            const requested = data.seek_position;
            members(id).forEach(member => {
              const duration = next[member].attributes.media_duration;
              const limit = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : Infinity;
              update(member, { media_position: Math.max(0, Math.min(limit, requested)), media_position_updated_at: timestamp });
            });
          }
          break;
      }
    }
  }
  return next;
}

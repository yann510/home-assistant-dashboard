import { describe, expect, it } from 'vitest';
import type { HassEntities } from 'home-assistant-js-websocket';
import { applySpeakerService } from './speaker-services';

function fixtures(): HassEntities {
  return Object.fromEntries(
    ['living_room', 'bathroom', 'gym'].map(room => {
      const id = `media_player.${room}`;
      return [
        id,
        {
          entity_id: id,
          state: room === 'living_room' ? 'playing' : 'idle',
          attributes: { group_members: [id], volume_level: 0.32, is_volume_muted: false },
          last_changed: '',
          last_updated: '',
          context: { id: '', parent_id: null, user_id: null },
        },
      ];
    })
  );
}
const call = (service: string, entity_id: string[], service_data = {}) => ({
  type: 'call_service',
  domain: 'media_player',
  service,
  target: { entity_id },
  service_data,
});

describe('local speaker service responses', () => {
  it('reflects group mute and unmute without changing volume or unrelated speakers', () => {
    const original = fixtures();
    const targets = ['media_player.living_room', 'media_player.bathroom'];
    const muted = applySpeakerService(original, call('volume_mute', targets, { is_volume_muted: true }))!;
    targets.forEach(id => {
      expect(muted[id].attributes.is_volume_muted).toBe(true);
      expect(muted[id].attributes.volume_level).toBe(0.32);
    });
    expect(muted['media_player.gym'].attributes.is_volume_muted).toBe(false);
    expect(original['media_player.living_room'].attributes.is_volume_muted).toBe(false);
    const unmuted = applySpeakerService(muted, call('volume_mute', targets, { is_volume_muted: false }))!;
    targets.forEach(id => expect(unmuted[id].attributes.is_volume_muted).toBe(false));
  });

  it('confirms room joins and removals on every affected speaker', () => {
    const joined = applySpeakerService(
      fixtures(),
      call('join', ['media_player.living_room'], { group_members: ['media_player.bathroom', 'media_player.gym'] })
    )!;
    Object.values(joined).forEach(entity => {
      expect(entity.attributes.group_members).toEqual(['media_player.living_room', 'media_player.bathroom', 'media_player.gym']);
      expect(entity.state).toBe('playing');
    });
    const removed = applySpeakerService(joined, call('unjoin', ['media_player.bathroom']))!;
    expect(removed['media_player.bathroom'].attributes.group_members).toEqual(['media_player.bathroom']);
    expect(removed['media_player.bathroom'].state).toBe('idle');
    for (const id of ['media_player.living_room', 'media_player.gym'])
      expect(removed[id].attributes.group_members).toEqual(['media_player.living_room', 'media_player.gym']);
  });

  it('hands the queue and playback to remaining rooms when the coordinator leaves', () => {
    const original = fixtures();
    Object.assign(original['media_player.living_room'].attributes, {
      media_title: 'Current song', media_content_id: 'queue:track', media_position: 87,
    });
    const joined = applySpeakerService(original, call('join', ['media_player.living_room'], {
      group_members: ['media_player.bathroom', 'media_player.gym'],
    }))!;
    const transferred = applySpeakerService(joined, call('unjoin', ['media_player.living_room']))!;
    for (const id of ['media_player.bathroom', 'media_player.gym']) {
      expect(transferred[id].state).toBe('playing');
      expect(transferred[id].attributes.group_members).toEqual(['media_player.bathroom', 'media_player.gym']);
      expect(transferred[id].attributes.media_content_id).toBe('queue:track');
      expect(transferred[id].attributes.media_position).toBe(87);
    }
    expect(transferred['media_player.living_room'].state).toBe('idle');
    expect(transferred['media_player.living_room'].attributes.group_members).toEqual(['media_player.living_room']);
  });

  it('updates volume and playback for the intended speakers', () => {
    const volume = applySpeakerService(fixtures(), call('volume_set', ['media_player.living_room'], { volume_level: 0.5 }))!;
    expect(volume['media_player.living_room'].attributes.volume_level).toBe(0.5);
    expect(volume['media_player.bathroom'].attributes.volume_level).toBe(0.32);
    const paused = applySpeakerService(volume, call('media_pause', ['media_player.living_room']))!;
    expect(paused['media_player.living_room'].state).toBe('paused');
    expect(paused['media_player.bathroom'].state).toBe('idle');
  });
});

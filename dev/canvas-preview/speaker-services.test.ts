import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => vi.useRealTimers());

  it('freezes group progress on pause and resumes without counting paused time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
    const initial = fixtures();
    Object.assign(initial['media_player.living_room'].attributes, {
      media_position: 42, media_duration: 250, media_position_updated_at: new Date().toISOString(),
    });
    const grouped = applySpeakerService(initial, call('join', ['media_player.living_room'], { group_members: ['media_player.bathroom'] }))!;
    vi.advanceTimersByTime(10000);
    const paused = applySpeakerService(grouped, call('media_pause', ['media_player.living_room']))!;
    for (const id of ['media_player.living_room', 'media_player.bathroom']) {
      expect(paused[id].state).toBe('paused');
      expect(paused[id].attributes.media_position).toBe(52);
    }
    vi.advanceTimersByTime(60000);
    const resumed = applySpeakerService(paused, call('media_play', ['media_player.living_room']))!;
    for (const id of ['media_player.living_room', 'media_player.bathroom']) {
      expect(resumed[id].attributes.media_position).toBe(52);
      expect(resumed[id].attributes.media_position_updated_at).toBe(new Date().toISOString());
    }
    vi.advanceTimersByTime(5000);
    const stopped = applySpeakerService(resumed, call('media_pause', ['media_player.living_room']))!;
    expect(stopped['media_player.living_room'].attributes.media_position).toBe(57);
    expect(stopped['media_player.bathroom'].attributes.media_position).toBe(57);
    expect(stopped['media_player.gym'].attributes.media_position).toBeUndefined();
  });

  it('seeks the group together and clamps progress to the track boundaries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
    const initial = fixtures();
    Object.assign(initial['media_player.living_room'].attributes, {
      media_position: 42, media_duration: 250, media_position_updated_at: new Date().toISOString(),
    });
    const grouped = applySpeakerService(initial, call('join', ['media_player.living_room'], { group_members: ['media_player.bathroom'] }))!;
    const sought = applySpeakerService(grouped, call('media_seek', ['media_player.living_room'], { seek_position: 100 }))!;
    vi.advanceTimersByTime(5000);
    const paused = applySpeakerService(sought, call('media_pause', ['media_player.living_room']))!;
    for (const id of ['media_player.living_room', 'media_player.bathroom']) expect(paused[id].attributes.media_position).toBe(105);
    for (const [requested, expected] of [[-10, 0], [999, 250], [NaN, 105], [Infinity, 105]]) {
      const result = applySpeakerService(paused, call('media_seek', ['media_player.living_room'], { seek_position: requested }))!;
      for (const id of ['media_player.living_room', 'media_player.bathroom']) expect(result[id].attributes.media_position).toBe(expected);
    }
  });

  it('does not invent a position for idle speakers or advance beyond a track duration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
    const initial = fixtures();
    Object.assign(initial['media_player.living_room'].attributes, {
      media_position: 248, media_duration: 250, media_position_updated_at: new Date().toISOString(),
    });
    vi.advanceTimersByTime(10000);
    const paused = applySpeakerService(initial, call('media_pause', ['media_player.living_room', 'media_player.bathroom']))!;
    expect(paused['media_player.living_room'].attributes.media_position).toBe(250);
    expect(paused['media_player.bathroom'].attributes.media_position).toBeUndefined();
  });

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

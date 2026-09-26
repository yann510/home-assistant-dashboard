import { SpeakerSeek } from '../SpeakerSeek';
import { SpeakerVolume } from '../SpeakerVolume';
import { useHass } from '@hakit/core';
import { useState } from 'react';
import { useCanvasMusic } from './CanvasMusicProvider';

export function CanvasFollow() {
  const { session: s, rooms } = useCanvasMusic();
  return (
    <div className='canvas-music__follow'>
      <button
        type='button'
        role='switch'
        aria-label='Follow me'
        aria-checked={s.following}
        aria-busy={s.updating}
        disabled={s.updating || rooms.busy || !s.canToggle}
        onClick={() => void s.updateFollowing(s.following ? 'disable' : 'enable')}
      >
        <span className='canvas-music__follow-label'>Follow me</span>
        <span className='canvas-music__follow-state' aria-hidden='true'>
          <span className='canvas-music__follow-indicator' />
          {s.following ? 'On' : 'Off'}
        </span>
      </button>
      {s.updating && <p role='status'>Updating Follow me…</p>}
      {!s.connected ? (
        <p role='status'>Reconnecting to Home Assistant…</p>
      ) : !s.configured ? (
        <p>Follow me is not available in Home Assistant.</p>
      ) : null}
      {s.canRetryCleanup && (
        <>
          <p>Motion following is off. Return audio to the original speaker.</p>
          <button disabled={rooms.busy || !s.connected || !s.configured} onClick={() => void s.updateFollowing('disable')}>
            Retry ungrouping
          </button>
        </>
      )}
      {s.error && <p role='alert'>{s.error}</p>}
    </div>
  );
}
export function CanvasTransport() {
  const { playback, disabled, playing, idle, attributes } = useCanvasMusic();
  const features = attributes?.supported_features ?? 0;
  if (idle) return null;
  return (
    <div className='canvas-music__transport' aria-label='Playback controls' aria-busy={playback.busy}>
      <button
        aria-label='Previous track'
        disabled={disabled || playback.busy || !(features & 16)}
        onClick={() => void playback.transport('media_previous_track', 'play the previous track')}
      >
        ⏮
      </button>
      <button
        aria-label={playing ? 'Pause' : 'Resume'}
        disabled={disabled || playback.busy || !(features & (playing ? 1 : 16384))}
        onClick={() => void playback.transport(playing ? 'media_pause' : 'media_play', playing ? 'pause playback' : 'start playback')}
      >
        {playing ? 'Ⅱ' : '▶'}
      </button>
      <button
        aria-label='Next track'
        disabled={disabled || playback.busy || !(features & 32)}
        onClick={() => void playback.transport('media_next_track', 'play the next track')}
      >
        ⏭
      </button>
      {playback.error && <p role='alert'>{playback.error}</p>}
    </div>
  );
}
export function CanvasMusic({
  onOpenPlayer,
  onOpenSpeakers,
}: {
  onOpenPlayer(trigger: HTMLElement): void;
  onOpenSpeakers(trigger: HTMLElement): void;
}) {
  const { session, title, trackTitle, attributes, idle, rooms, disabled } = useCanvasMusic();
  const { joinHassUrl } = useHass();
  const [failedArtwork, setFailedArtwork] = useState<string>();
  const picture = !idle && !disabled ? attributes?.entity_picture : undefined;
  function openSpeakers(trigger: HTMLElement) {
    if (!rooms.busy) rooms.begin();
    onOpenSpeakers(trigger);
  }
  return (
    <section className='canvas__music canvas-music' aria-label='Music'>
      <div className='canvas-music__track'>
        <div className='canvas-music__cover' aria-hidden='true'>
          {picture && failedArtwork !== picture ? (
            <img src={joinHassUrl(picture)} alt='' onError={() => setFailedArtwork(picture)} />
          ) : (
            <span>♪</span>
          )}
        </div>
        <div className='canvas-music__metadata'>
          <span className='canvas__eyebrow'>{trackTitle ? 'Music, for this moment' : 'Music'}</span>
          <div className={`canvas-music__title${trackTitle ? '' : ' canvas-music__title--status'}`}>{title}</div>
          {!idle && !disabled && attributes?.media_artist && <p>{attributes.media_artist}</p>}
        </div>
      </div>
      <button className='canvas-music__favourites' aria-label='Open favourites' onClick={event => onOpenPlayer(event.currentTarget)}>
        <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z' /></svg>
      </button>
      {!idle && !disabled && Number.isFinite(attributes?.media_position) && (
        <SpeakerSeek
          key={`${session.entityId}:${attributes?.media_content_id ?? ''}:${attributes?.media_title ?? ''}`}
          entityId={session.entityId}
          disabled={disabled}
        />
      )}
      <div className='canvas-music__bottom'>
        <CanvasTransport />
        <SpeakerVolume
          key={session.targets.join(',')}
          entityId={session.entityId}
          targets={session.targets}
          disabled={disabled}
          onOpenSettings={openSpeakers}
        />
      </div>
      <div className='canvas-music__settings'>
        <CanvasFollow />
        <button className='canvas-music__room' aria-label='Open speakers' onClick={event => openSpeakers(event.currentTarget)}>
          {attributes?.friendly_name ?? 'Speakers'}
          {session.targets.length > 1 ? ` +${session.targets.length - 1}` : ''} →
        </button>
      </div>
      <svg className='canvas-music__art' viewBox='0 0 200 160' aria-hidden='true'>
        <circle cx='140' cy='80' r='70' />
        <circle cx='140' cy='80' r='45' />
        <circle cx='140' cy='80' r='20' />
      </svg>
    </section>
  );
}

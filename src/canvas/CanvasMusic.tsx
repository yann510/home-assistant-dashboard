import './canvas-feature-motion.css';
import { CanvasActionIcon } from './CanvasActionIcon';
import { SpeakerSeek } from '../SpeakerSeek';
import { SpeakerVolume } from '../SpeakerVolume';
import { useHass } from '@hakit/core';
import { useState } from 'react';
import { useCanvasMusic } from './CanvasMusicProvider';
import { spotifyTrackUri } from './spotifyTrackUri';
import { CanvasTrackHeart } from './CanvasTrackHeart';

export function CanvasFollow() {
  const { session: s, rooms, playlistPlayback } = useCanvasMusic();
  return (
    <div className='canvas-music__follow'>
      <button
        type='button'
        role='switch'
        aria-label='Follow me'
        aria-checked={s.following}
        aria-busy={s.updating}
        disabled={s.updating || rooms.busy || !!playlistPlayback.pending || !s.canToggle}
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
          <button disabled={rooms.busy || !!playlistPlayback.pending || !s.connected || !s.configured} onClick={() => void s.updateFollowing('disable')}>
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
        <CanvasActionIcon action='previous' size={20} />
      </button>
      <button
        aria-label={playing ? 'Pause' : 'Resume'}
        disabled={disabled || playback.busy || !(features & (playing ? 1 : 16384))}
        onClick={() => void playback.transport(playing ? 'media_pause' : 'media_play', playing ? 'pause playback' : 'start playback')}
      >
        <span className='canvas-music__play-motion'>
          <CanvasActionIcon action={playing ? 'pause' : 'play'} size={20} />
        </span>
      </button>
      <button
        aria-label='Next track'
        disabled={disabled || playback.busy || !(features & 32)}
        onClick={() => void playback.transport('media_next_track', 'play the next track')}
      >
        <CanvasActionIcon action='next' size={20} />
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
  const { session, title, trackTitle, attributes, idle, rooms, disabled, playback, playlistPlayback, currentTrackUri } = useCanvasMusic();
  const { joinHassUrl } = useHass();
  const [failedArtwork, setFailedArtwork] = useState<string>();
  const [loadedArtwork, setLoadedArtwork] = useState<string>();
  const available = session.connected && session.coordinator && !['unknown', 'unavailable'].includes(session.coordinator.state);
  const picture = !idle && available ? attributes?.entity_picture : undefined;
  const artworkUrl = picture ? joinHassUrl(picture) : undefined;
  const usableArtwork = artworkUrl && failedArtwork !== artworkUrl ? artworkUrl : undefined;
  const hasArtwork = !!usableArtwork && loadedArtwork === usableArtwork;
  const activePlayback = !!available && session.coordinator?.state === 'playing' && !disabled && !playback.busy
    && !session.updating && !playlistPlayback.pending && !playback.error && !session.error && !rooms.error
    && !playlistPlayback.error;
  const linkTrackUri = currentTrackUri ?? spotifyTrackUri(attributes?.media_content_id);
  const spotifyHref = trackTitle ? linkTrackUri ?? 'spotify:' : undefined;
  const Cover = trackTitle ? 'a' : 'div';
  const Title = trackTitle ? 'a' : 'div';
  function openSpeakers(trigger: HTMLElement) {
    if (!rooms.busy) rooms.begin();
    onOpenSpeakers(trigger);
  }
  return (
    <section className='canvas__music canvas-music' aria-label='Music' data-artwork={hasArtwork && activePlayback} data-playing={activePlayback}>
      <div className='canvas-music__atmosphere' aria-hidden='true'>
        {usableArtwork && <img src={usableArtwork} alt='' onLoad={() => setLoadedArtwork(usableArtwork)} onError={() => setFailedArtwork(usableArtwork)} />}
      </div>
      <div className='canvas-music__track'>
        <Cover className='canvas-music__cover' href={spotifyHref} aria-label={trackTitle ? linkTrackUri ? 'Open current song in Spotify' : 'Open Spotify app' : undefined} aria-hidden={trackTitle ? undefined : true}>
          {usableArtwork ? (
            <img src={usableArtwork} alt='' onLoad={() => setLoadedArtwork(usableArtwork)} onError={() => setFailedArtwork(usableArtwork)} />
          ) : (
            <span aria-hidden='true'>♪</span>
          )}
        </Cover>
        <div className='canvas-music__metadata'>
          <span className='canvas__eyebrow'>{trackTitle ? 'Music, for this moment' : 'Music'}</span>
          <div className='canvas-music__title-row'>
            <Title className={`canvas-music__title${trackTitle ? '' : ' canvas-music__title--status'}`} href={spotifyHref}>{title}</Title>
            <CanvasTrackHeart trackUri={currentTrackUri} title={trackTitle ?? title} enabled={!!available && !idle} />
          </div>
          {!idle && available && attributes?.media_artist && <p>{attributes.media_artist}</p>}
        </div>
      </div>
      <div className='canvas-music__bottom'>
        <CanvasTransport />
        <button className='canvas-music__playlists' aria-haspopup='dialog' onClick={event => onOpenPlayer(event.currentTarget)}>Playlists</button>
        <SpeakerVolume
          key={session.targets.join(',')}
          entityId={session.entityId}
          targets={session.targets}
          disabled={disabled}
          onOpenSettings={openSpeakers}
        />
      </div>
      {!idle && available && Number.isFinite(attributes?.media_position) && (
        <SpeakerSeek
          key={`${session.entityId}:${attributes?.media_content_id ?? ''}:${attributes?.media_title ?? ''}`}
          entityId={session.entityId}
          disabled={disabled}
        />
      )}
      <div className='canvas-music__settings'>
        <CanvasFollow />
        <button className='canvas-music__room' aria-label='Open speakers' onClick={event => openSpeakers(event.currentTarget)}>
          {attributes?.friendly_name ?? 'Speakers'}
          {session.targets.length > 1 ? ` +${session.targets.length - 1}` : ''} <CanvasActionIcon action='forward' />
        </button>
      </div>
      <div className='canvas-music__decoration' aria-hidden='true'>
        <svg className='canvas-music__art' viewBox='0 0 200 160'>
          <circle cx='140' cy='80' r='70' />
          <circle cx='140' cy='80' r='45' />
          <circle cx='140' cy='80' r='20' />
        </svg>
      </div>
      {playlistPlayback.status && <p className='canvas-music__play-status' role='status'>{playlistPlayback.status}</p>}
    </section>
  );
}

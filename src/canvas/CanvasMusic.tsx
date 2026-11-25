import './canvas-feature-motion.css';
import { CanvasActionIcon } from './CanvasActionIcon';
import { SpeakerSeek } from '../SpeakerSeek';
import { SpeakerVolume } from '../SpeakerVolume';
import { useHass } from '@hakit/core';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasMusic } from './CanvasMusicProvider';
import { spotifyTrackUri } from './spotifyTrackUri';
import { CanvasTrackHeart } from './CanvasTrackHeart';

function revealMusicFeedback(message: HTMLElement | null) {
  // Show the new message inside its own scrollport, keeping the dashboard in place.
  if (message?.parentElement) message.parentElement.scrollTop = message.offsetTop;
}

function CanvasFollow() {
  const { session, rooms, playlistPlayback } = useCanvasMusic();
  return (
    <button
      type='button'
      className='canvas-music__follow'
      role='switch'
      aria-label='Follow me'
      aria-checked={session.following}
      aria-busy={session.updating}
      disabled={session.updating || rooms.busy || !!playlistPlayback.pending || !session.canToggle}
      onClick={() => void session.updateFollowing(session.following ? 'disable' : 'enable')}
    >
      <span className='canvas-music__follow-label'>Follow me</span>
      <span className='canvas-music__follow-state' aria-hidden='true'>
        <span className='canvas-music__follow-indicator' />
        {session.following ? 'On' : 'Off'}
      </span>
    </button>
  );
}

function CanvasTransport() {
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
  const [feedback, setFeedback] = useState<HTMLDivElement | null>(null);
  const renderError = feedback
    ? (error: string) =>
        createPortal(
          <p role='alert' ref={revealMusicFeedback}>
            {error}
          </p>,
          feedback
        )
    : undefined;
  const available = session.connected && session.coordinator && !['unknown', 'unavailable'].includes(session.coordinator.state);
  const picture = !idle && available ? attributes?.entity_picture : undefined;
  const artworkUrl = picture ? joinHassUrl(picture) : undefined;
  const usableArtwork = artworkUrl && failedArtwork !== artworkUrl ? artworkUrl : undefined;
  const hasArtwork = !!usableArtwork && loadedArtwork === usableArtwork;
  const activePlayback =
    !!available &&
    session.coordinator?.state === 'playing' &&
    !disabled &&
    !playback.busy &&
    !session.updating &&
    !playlistPlayback.pending &&
    !playback.error &&
    !session.error &&
    !rooms.error &&
    !playlistPlayback.error;
  const linkTrackUri = currentTrackUri ?? spotifyTrackUri(attributes?.media_content_id);
  const spotifyHref = trackTitle ? (linkTrackUri ?? 'spotify:') : undefined;
  const Cover = trackTitle ? 'a' : 'div';
  const Title = trackTitle ? 'a' : 'div';
  function openSpeakers(trigger: HTMLElement) {
    if (!rooms.busy) rooms.begin();
    onOpenSpeakers(trigger);
  }
  return (
    <section
      className='canvas__music canvas-music'
      aria-label='Music'
      data-artwork={hasArtwork && activePlayback}
      data-playing={activePlayback}
    >
      <div className='canvas-music__atmosphere' aria-hidden='true'>
        {usableArtwork && (
          <img src={usableArtwork} alt='' onLoad={() => setLoadedArtwork(usableArtwork)} onError={() => setFailedArtwork(usableArtwork)} />
        )}
      </div>
      <CanvasTrackHeart trackUri={currentTrackUri} title={trackTitle ?? title} enabled={!!available && !idle} />
      <div className='canvas-music__track'>
        <Cover
          className='canvas-music__cover'
          href={spotifyHref}
          aria-label={trackTitle ? (linkTrackUri ? 'Open current song in Spotify' : 'Open Spotify app') : undefined}
          aria-hidden={trackTitle ? undefined : true}
        >
          {usableArtwork ? (
            <img
              src={usableArtwork}
              alt=''
              onLoad={() => setLoadedArtwork(usableArtwork)}
              onError={() => setFailedArtwork(usableArtwork)}
            />
          ) : (
            <span aria-hidden='true'>♪</span>
          )}
        </Cover>
        <div className='canvas-music__metadata'>
          <Title className='canvas-music__metadata-link' href={spotifyHref} aria-label={trackTitle ? title : undefined}>
            <span className='canvas__eyebrow'>{trackTitle ? 'Music, for this moment' : 'Music'}</span>
            <span className={`canvas-music__title${trackTitle ? '' : ' canvas-music__title--status'}`}>{title}</span>
          </Title>
          <p className='canvas-music__artist'>{!idle && available ? attributes?.media_artist : undefined}</p>
        </div>
      </div>
      <div className='canvas-music__bottom'>
        <CanvasTransport />
        <SpeakerVolume
          key={session.targets.join(',')}
          entityId={session.entityId}
          targets={session.targets}
          disabled={disabled}
          onOpenSettings={openSpeakers}
          renderError={renderError}
        />
      </div>
      <div className='canvas-music__seek-slot'>
        {!idle && available && Number.isFinite(attributes?.media_position) && (
          <SpeakerSeek
            key={`${session.entityId}:${attributes?.media_content_id ?? ''}:${attributes?.media_title ?? ''}`}
            entityId={session.entityId}
            disabled={disabled}
            renderError={renderError}
          />
        )}
      </div>
      <div className='canvas-music__settings'>
        <CanvasFollow />
        <button
          className='canvas-music__room canvas-music__playlists'
          aria-haspopup='dialog'
          onClick={event => onOpenPlayer(event.currentTarget)}
        >
          <span>Playlists</span>
          <CanvasActionIcon action='forward' />
        </button>
        <button className='canvas-music__room' aria-label='Open speakers' onClick={event => openSpeakers(event.currentTarget)}>
          <span>
            {attributes?.friendly_name ?? 'Speakers'}
            {session.targets.length > 1 ? ` +${session.targets.length - 1}` : ''}
          </span>
          <CanvasActionIcon action='forward' />
        </button>
      </div>
      <div className='canvas-music__feedback' role='region' aria-label='Music feedback' tabIndex={0} ref={setFeedback}>
        {!idle && playback.error && (
          <p key={playback.error} role='alert' ref={revealMusicFeedback}>
            {playback.error}
          </p>
        )}
        {session.updating && (
          <p role='status' ref={revealMusicFeedback}>
            Updating Follow me…
          </p>
        )}
        {!session.connected ? (
          <p role='status' ref={revealMusicFeedback}>
            Reconnecting to Home Assistant…
          </p>
        ) : !session.configured ? (
          <p ref={revealMusicFeedback}>Follow me is not available in Home Assistant.</p>
        ) : null}
        {session.canRetryCleanup && (
          <div className='canvas-music__cleanup' ref={revealMusicFeedback}>
            <p>Motion following is off. Return audio to the original speaker.</p>
            <button
              type='button'
              disabled={rooms.busy || !!playlistPlayback.pending || !session.connected || !session.configured}
              onClick={() => void session.updateFollowing('disable')}
            >
              Retry ungrouping
            </button>
          </div>
        )}
        {session.error && (
          <p key={session.error} role='alert' ref={revealMusicFeedback}>
            {session.error}
          </p>
        )}
      </div>
      <div className='canvas-music__decoration' aria-hidden='true'>
        <svg className='canvas-music__art' viewBox='0 0 200 160'>
          <circle cx='140' cy='80' r='70' />
          <circle cx='140' cy='80' r='45' />
          <circle cx='140' cy='80' r='20' />
        </svg>
      </div>
      {playlistPlayback.status && (
        <p className='canvas-music__play-status' role='status'>
          {playlistPlayback.status}
        </p>
      )}
    </section>
  );
}

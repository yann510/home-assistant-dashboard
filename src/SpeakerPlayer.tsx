import { useRef, useState } from 'react';
import { useEntity, useHass, useIcon, useStore, type EntityName, type FilterByDomain } from '@hakit/core';
import { SpeakerFavourites } from './SpeakerFavourites';
import { SpeakerRooms } from './SpeakerRooms';
import { SpeakerVolume } from './SpeakerVolume';
import { SpeakerSeek } from './SpeakerSeek';
import { useSpeakerCommand, type SpeakerService } from './useSpeakerCommand';

type SpeakerId = FilterByDomain<EntityName, 'media_player'>;

function SpeakerIcon({ name }: { name: string }) {
  return useIcon(name);
}

export function SpeakerPlayer({ entityId, members }: { entityId: SpeakerId; members: SpeakerId[] }) {
  const entity = useEntity(entityId, { returnNullIfNotFound: true });
  const connection = useStore(state => state.connection);
  const connectionStatus = useStore(state => state.connectionStatus);
  const { joinHassUrl } = useHass();
  const { send, error } = useSpeakerCommand();
  const [favouritesCount, setFavouritesCount] = useState<number | null>(null);
  const [favouritesOpen, setFavouritesOpen] = useState(false);
  const favouritesTrigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const attributes = entity?.attributes;
  const name = attributes?.friendly_name ?? 'Speaker';
  const unavailable = !entity || ['unknown', 'unavailable'].includes(entity.state);
  const connected = Boolean(connection?.connected && connectionStatus === 'connected');
  const disabled = unavailable || !connected;
  const playing = entity?.state === 'playing' || entity?.state === 'buffering';
  // A retained Spotify Connect session can report paused without a track.
  const hasMediaDetails = Boolean(attributes?.media_title?.trim() || attributes?.media_playlist?.trim());
  const idle = !playing && (entity?.state !== 'paused' || !hasMediaDetails);
  const features = attributes?.supported_features ?? 0;
  const targets = [...new Set([entityId, ...members])];
  const picture = !idle ? attributes?.entity_picture : undefined;
  const artwork = picture?.startsWith('/') ? joinHassUrl(picture) : picture;

  async function transport(service: SpeakerService, description: string) {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    // Sonos followers forward transport to the coordinator. Targeting every
    // member repeats skips and can repeat slow/failed pause requests.
    await send(service, [entityId], description);
    inFlight.current = false;
    setBusy(false);
  }

  return (
    <>
      <div className={`speaker-player${artwork ? ' speaker-player--with-art' : ''}`} aria-label='Playback controls'>
        {artwork && <img className='speaker-artwork' src={artwork} alt='' />}
        <div className='speaker-player-controls'>
          <div className='speaker-header'>
            <div className='speaker-metadata'>
              <SpeakerRooms source={entityId} members={targets} disabled={disabled} />
              <div className='speaker-track-title'>
                {unavailable
                  ? `${name} is unavailable`
                  : idle
                    ? 'Ready to play'
                    : attributes?.media_title || attributes?.media_playlist || 'Paused'}
              </div>
              {!idle && !unavailable && attributes?.media_artist && <div className='speaker-artist'>{attributes.media_artist}</div>}
            </div>
          </div>
          {!connected && (
            <p className='speaker-connection-status' role='status'>
              Reconnecting to Home Assistant…
            </p>
          )}
          <SpeakerFavourites
            key={'favourites:' + entityId}
            entityId={entityId}
            destination={name + (targets.length > 1 ? ' +' + (targets.length - 1) : '')}
            idle={idle}
            onCount={setFavouritesCount}
            disabled={disabled}
            open={favouritesOpen}
            onOpen={() => setFavouritesOpen(true)}
            onClose={() => {
              setFavouritesOpen(false);
              favouritesTrigger.current?.focus({ preventScroll: true });
            }}
          />
          {!idle && (
            <SpeakerSeek
              key={`${attributes?.media_content_id ?? ''}:${attributes?.media_title ?? ''}`}
              entityId={entityId}
              disabled={disabled}
            />
          )}
          <SpeakerVolume key={targets.join(',')} entityId={entityId} targets={targets} disabled={disabled}>
            <div className='speaker-playback' aria-busy={busy}>
              {!idle && (
                <>
                  <button
                    type='button'
                    className='speaker-control'
                    aria-label='Previous track'
                    disabled={disabled || busy || !(features & 16)}
                    onClick={() => void transport('media_previous_track', 'play the previous track')}
                  >
                    <SpeakerIcon name='mdi:skip-previous' />
                  </button>
                  <button
                    type='button'
                    className='speaker-control speaker-play-pause'
                    aria-label={playing ? 'Pause' : 'Resume'}
                    disabled={disabled || busy || !(features & (playing ? 1 : 16384))}
                    onClick={() => void transport(playing ? 'media_pause' : 'media_play', playing ? 'pause playback' : 'start playback')}
                  >
                    <SpeakerIcon name={playing ? 'mdi:pause' : 'mdi:play'} />
                  </button>
                  <button
                    type='button'
                    className='speaker-control'
                    aria-label='Next track'
                    disabled={disabled || busy || !(features & 32)}
                    onClick={() => void transport('media_next_track', 'play the next track')}
                  >
                    <SpeakerIcon name='mdi:skip-next' />
                  </button>
                </>
              )}
              {!(idle && !disabled && favouritesCount !== null && favouritesCount > 0 && favouritesCount <= 12) && (
                <button
                  ref={favouritesTrigger}
                  type='button'
                  className='speaker-control speaker-favourites-trigger'
                  aria-label='Favourites'
                  aria-haspopup='dialog'
                  aria-expanded={favouritesOpen}
                  disabled={disabled}
                  onClick={() => setFavouritesOpen(true)}
                >
                  <SpeakerIcon name='mdi:playlist-music' />
                </button>
              )}
            </div>
          </SpeakerVolume>
          {error && (
            <p className='speaker-command-error' role='alert'>
              {error}
            </p>
          )}
          {Boolean(features & (entity?.state === 'off' ? 128 : 256)) && (
            <button
              type='button'
              className='speaker-mute'
              disabled={disabled || busy}
              onClick={() => void transport(entity?.state === 'off' ? 'turn_on' : 'turn_off', 'change speaker power')}
            >
              <SpeakerIcon name='mdi:power' />
              {entity?.state === 'off' ? 'Turn on' : 'Turn off'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

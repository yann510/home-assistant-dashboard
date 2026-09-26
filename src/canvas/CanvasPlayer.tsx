import { useEffect } from 'react';
import { SpeakerSeek } from '../SpeakerSeek';
import { CanvasTransport } from './CanvasMusic';
import { CanvasFavourites } from './CanvasFavourites';
import { useCanvasMusic } from './CanvasMusicProvider';

export function CanvasPlayer() {
  const { session, title, trackTitle, attributes, disabled, playing, idle, setLibraryOpen } = useCanvasMusic();
  useEffect(() => {
    setLibraryOpen(true);
    return () => setLibraryOpen(false);
  }, [setLibraryOpen]);
  return (
    <div className='canvas-player'>
      {trackTitle ? (
        <>
          <span className='canvas__eyebrow'>{playing ? 'Now playing' : 'Paused'}</span>
          <h2>{trackTitle}</h2>
          {attributes?.media_artist && <p>{attributes.media_artist}</p>}
        </>
      ) : (
        <div className='canvas-player__empty' role='status'>
          <span className='canvas__eyebrow'>Music</span>
          <p className='canvas-player__status'>{title}</p>
          {!disabled && <p>{playing ? 'Track details are unavailable.' : 'Choose a favourite to start.'}</p>}
        </div>
      )}
      {!idle && !disabled && Number.isFinite(attributes?.media_position) && (
        <SpeakerSeek
          key={`${session.entityId}:${attributes?.media_content_id ?? ''}:${attributes?.media_title ?? ''}`}
          entityId={session.entityId}
          disabled={disabled}
        />
      )}
      <CanvasTransport />
      {!session.connected && <p role='status'>Reconnecting to Home Assistant…</p>}
      <CanvasFavourites />
    </div>
  );
}

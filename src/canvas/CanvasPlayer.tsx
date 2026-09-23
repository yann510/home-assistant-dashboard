import { useEffect } from 'react';
import { SpeakerSeek } from '../SpeakerSeek';
import { CanvasTransport } from './CanvasMusic';
import { CanvasFavourites } from './CanvasFavourites';
import { useCanvasMusic } from './CanvasMusicProvider';

export function CanvasPlayer() {
  const { session, title, attributes, disabled, idle, setLibraryOpen } = useCanvasMusic();
  useEffect(() => {
    setLibraryOpen(true);
    return () => setLibraryOpen(false);
  }, [setLibraryOpen]);
  return (
    <div className='canvas-player'>
      <span className='canvas__eyebrow'>Now playing</span>
      <h2>{title}</h2>
      {!idle && attributes?.media_artist && <p>{attributes.media_artist}</p>}
      <CanvasTransport />
      {!idle && Number.isFinite(attributes?.media_position) && (
        <SpeakerSeek
          key={`${session.entityId}:${attributes?.media_content_id ?? ''}:${attributes?.media_title ?? ''}`}
          entityId={session.entityId}
          disabled={disabled}
        />
      )}
      {!session.connected && <p role='status'>Reconnecting to Home Assistant…</p>}
      <CanvasFavourites />
    </div>
  );
}

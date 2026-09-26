import { useEffect } from 'react';
import { CanvasFavourites } from './CanvasFavourites';
import { useCanvasMusic } from './CanvasMusicProvider';

export function CanvasPlayer() {
  const { session, setLibraryOpen } = useCanvasMusic();
  useEffect(() => {
    setLibraryOpen(true);
    return () => setLibraryOpen(false);
  }, [setLibraryOpen]);
  return (
    <div className='canvas-player'>
      {!session.connected && <p role='status'>Reconnecting to Home Assistant…</p>}
      <CanvasFavourites />
    </div>
  );
}

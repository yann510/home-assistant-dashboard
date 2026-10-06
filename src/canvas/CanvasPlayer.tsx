import { useEffect } from 'react';
import { CanvasFavourites } from './CanvasFavourites';
import { useCanvasMusic } from './CanvasMusicProvider';

export function CanvasPlayer({ onClose }: { onClose(): void }) {
  const { setLibraryOpen } = useCanvasMusic();
  useEffect(() => {
    setLibraryOpen(true);
    return () => setLibraryOpen(false);
  }, [setLibraryOpen]);
  return (
    <div className='canvas-player'>
      <CanvasFavourites onPlayed={onClose} />
    </div>
  );
}

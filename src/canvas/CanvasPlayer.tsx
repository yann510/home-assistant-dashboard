import { useEffect } from 'react';
import { CanvasActionIcon } from './CanvasActionIcon';
import { CanvasPlaylists } from './CanvasPlaylists';
import { useCanvasMusic } from './CanvasMusicProvider';

export function CanvasPlayer({ onClose }: { onClose(): void }) {
  const { setLibraryOpen } = useCanvasMusic();
  useEffect(() => {
    setLibraryOpen(true);
    return () => setLibraryOpen(false);
  }, [setLibraryOpen]);
  return (
    <div className='canvas-player'>
      <nav className='canvas-player__spotify' aria-label='Browse in Spotify'>
        <a href='spotify:'>Open Spotify app <CanvasActionIcon action='forward' /></a>
        <a href='https://open.spotify.com/' target='_blank' rel='noopener noreferrer'>Spotify web player</a>
      </nav>
      <CanvasPlaylists onPlayed={onClose} />
    </div>
  );
}

import { likedSongs, LIKED_SONGS_URI } from '../spotifyPlaybackContext';
import { useEffect, useId, useRef, useState } from 'react';
import { animateFavouriteArtwork } from './favouriteArtworkTransition';
import { useHass } from '@hakit/core';
import type { SpotifyPlaylist } from '../spotifyMusicTypes';
import { useCanvasMusic } from './CanvasMusicProvider';

function Artwork({ item }: { item: SpotifyPlaylist }) {
  const { joinHassUrl } = useHass();
  const [failed, setFailed] = useState(false);
  if (item.uri === LIKED_SONGS_URI)
    return (
      <span className='canvas-playlists__fallback' aria-hidden='true'>
        ♥
      </span>
    );
  return item.thumbnail && !failed ? (
    <img
      src={item.thumbnail.startsWith('/') ? joinHassUrl(item.thumbnail) : item.thumbnail}
      alt=''
      loading='lazy'
      onError={() => setFailed(true)}
    />
  ) : (
    <span className='canvas-playlists__fallback' aria-hidden='true'>
      ♫
    </span>
  );
}
function revealPlaybackMessage(message: HTMLParagraphElement | null) {
  if (message?.parentElement) message.parentElement.scrollTop = 0;
}

export function CanvasPlaylists({ onPlayed }: { onPlayed(): void }) {
  const { playlists: library, playlistPlayback: playback, disabled, session, rooms } = useCanvasMusic();
  const [filter, setFilter] = useState('');
  const libraryErrorId = useId();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function play(item: SpotifyPlaylist, button: HTMLButtonElement) {
    const confirmed = await playback.play(item);
    if (!confirmed || !mounted.current) return;
    animateFavouriteArtwork(button.querySelector('img'), document.querySelector('.canvas-music__cover'));
    onPlayed();
  }
  const shown = [likedSongs, ...library.items].filter(item =>
    `${item.title} ${item.owner}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())
  );
  const libraryError = session.connected ? library.error : undefined;
  const noPlaylists = !library.loading && !library.error && session.connected && library.items.length === 0;
  const hasFeedback = !!(
    playback.status ||
    playback.pending ||
    playback.error ||
    !session.connected ||
    library.loading ||
    library.error ||
    noPlaylists
  );
  return (
    <section className='canvas-playlists' aria-label='Your Spotify playlists'>
      <label className='canvas-playlists__filter'>
        <span>Filter loaded playlists</span>
        <input type='search' value={filter} onChange={event => setFilter(event.target.value)} />
      </label>
      <section className='canvas-playlists__feedback' aria-label='Playlist playback'>
        <button onClick={library.refresh} disabled={!session.connected || library.loading || library.loadingMore}>
          Refresh
        </button>
        <div className='canvas-playlists__messages' tabIndex={hasFeedback ? 0 : undefined}>
          {!hasFeedback && <span>{library.items.length} playlists loaded</span>}
          {playback.status && <p role='status'>{playback.status}</p>}
          {playback.pending && (
            <p role='status' ref={revealPlaybackMessage}>
              Starting {playback.pending.title}…
            </p>
          )}
          {playback.error && (
            <p role='alert' ref={revealPlaybackMessage}>
              {playback.error}
            </p>
          )}
          {!session.connected && <p role='status'>Reconnecting to Home Assistant. Playlists will load when connected.</p>}
          {library.loading && <p role='status'>Loading playlists…</p>}
          {libraryError && (
            <p role='alert' id={libraryErrorId}>
              {libraryError}
            </p>
          )}
          {noPlaylists && <p>No saved Spotify playlists yet.</p>}
        </div>
        {libraryError && (
          <button aria-describedby={libraryErrorId} onClick={library.retry} disabled={library.loading || library.loadingMore}>
            Retry playlists
          </button>
        )}
      </section>
      {shown.length === 0 && <p>No loaded playlists match this filter.</p>}
      <div className='canvas-playlists__grid'>
        {shown.map(item => (
          <button
            key={item.uri}
            aria-label={item.uri === LIKED_SONGS_URI ? 'Play Liked Songs' : `Play ${item.title} by ${item.owner}`}
            disabled={disabled || session.updating || rooms.busy || !!playback.pending}
            onClick={event => void play(item, event.currentTarget)}
          >
            <span className='canvas-playlists__artwork'>
              <Artwork key={item.thumbnail} item={item} />
            </span>
            <span className='canvas-playlists__labels'>
              <span className='canvas-playlists__title'>{item.title}</span>
              <span className='canvas-playlists__owner'>{item.owner}</span>
            </span>
          </button>
        ))}
      </div>
      {library.hasMore && (
        <button onClick={library.loadMore} disabled={!session.connected || library.loading || library.loadingMore}>
          {library.loadingMore ? 'Loading more…' : 'Load more'}
        </button>
      )}
    </section>
  );
}

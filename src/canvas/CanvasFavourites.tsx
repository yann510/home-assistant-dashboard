import { useEffect, useRef, useState } from 'react';
import { animateFavouriteArtwork } from './favouriteArtworkTransition';
import { useHass } from '@hakit/core';
import type { FavouriteItem } from '../useSpeakerFavourites';
import { useCanvasMusic } from './CanvasMusicProvider';

function Artwork({ item }: { item: FavouriteItem }) {
  const { joinHassUrl } = useHass();
  const [failed, setFailed] = useState(false);
  return item.thumbnail && !failed ? (
    <img
      src={item.thumbnail.startsWith('/') ? joinHassUrl(item.thumbnail) : item.thumbnail}
      alt=''
      loading='lazy'
      onError={() => setFailed(true)}
    />
  ) : (
    <span className='canvas-favourites__fallback' aria-hidden='true'>
      <span>♫</span>
      <span className='canvas-favourites__title'>{item.title}</span>
    </span>
  );
}
export function CanvasFavourites({ onPlayed }: { onPlayed(): void }) {
  const { favourites: f, favouritePlayback: p, disabled } = useCanvasMusic();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function play(item: FavouriteItem, button: HTMLButtonElement) {
    const confirmed = await p.play(item);
    // The playback request survives navigation, but its gallery does not.
    if (!confirmed || !mounted.current) return;
    animateFavouriteArtwork(button.querySelector('img'), document.querySelector('.canvas-music__cover'));
    onPlayed();
  }
  return (
    <section className='canvas-favourites' aria-label='Favourites'>
      {f.loading ? (
        <p role='status'>Loading favourites…</p>
      ) : f.error ? (
        <p role='alert'>
          Could not load favourites. <button onClick={f.retry}>Retry favourites</button>
        </p>
      ) : !f.items.length ? (
        <p>Choose this speaker in your music app.</p>
      ) : (
        <div className='canvas-favourites__grid'>
          {f.items.map(item => (
            <button
              key={item.media_content_type + ':' + item.media_content_id}
              aria-label={`Play ${item.title}`}
              disabled={disabled || !!p.pending}
              onClick={event => void play(item, event.currentTarget)}
            >
              <Artwork key={item.thumbnail} item={item} />
            </button>
          ))}
        </div>
      )}
      {p.pending && <p role='status'>Starting {p.pending.title}…</p>}
      {(p.playError || p.commandError) && <p role='alert'>{p.playError || p.commandError}</p>}
    </section>
  );
}

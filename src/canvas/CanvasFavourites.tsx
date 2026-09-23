import { useState } from 'react';
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
export function CanvasFavourites() {
  const { favourites: f, favouritePlayback: p, disabled } = useCanvasMusic();
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
              onClick={() => void p.play(item)}
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

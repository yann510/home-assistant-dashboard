import { useEffect, useRef, useState } from 'react';
import { useCanvasMusic } from './CanvasMusicProvider';
import { CanvasActionIcon } from './CanvasActionIcon';
import { spotifyEnqueue } from './useListening';
import type { MusicItem } from './useSpotifyBrowser';

export function MusicItemActions({ item }: { item: MusicItem }) {
  const { listening, disabled, favouritePlayback, playback } = useCanvasMusic();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  if (!listening || !spotifyEnqueue(item)) return null;
  const blocked = disabled || listening.busy || !!favouritePlayback.pending || playback?.busy || !listening.canEnqueue;
  return (
    <div
      className='canvas-player__item-actions'
      ref={wrapper}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        aria-label={`Actions for ${item.title}`}
        aria-expanded={open}
        disabled={blocked}
        onClick={() => setOpen(value => !value)}
      >
        •••
      </button>
      {open && (
        <div className='canvas-player__action-menu' role='group' aria-label={`Queue actions for ${item.title}`}>
          {(['next', 'add'] as const).map(position => (
            <button
              key={position}
              disabled={blocked}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                void listening.enqueue(item, position);
              }}
            >
              {position === 'next' ? 'Play next' : 'Add to queue'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function CanvasQueue() {
  const { listening, session } = useCanvasMusic();
  useEffect(() => {
    void listening.refresh();
  }, [session.entityId, listening.canQueue]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className='canvas-player__queue' aria-label='Playback queue'>
      <div className='canvas-player__section-heading'>
        <h2>Queue</h2>
        <button
          disabled={listening.loading || !session.connected}
          onClick={() => {
            if (listening.canQueue) void listening.refresh();
            else listening.retryDiscovery();
          }}
        >
          Refresh queue
        </button>
      </div>
      {!listening.canQueue && <p role='status'>Queue is unavailable for this speaker.</p>}
      {listening.loading ? (
        <p role='status'>Loading queue…</p>
      ) : listening.queueError ? (
        <p role='alert'>{listening.queueError}</p>
      ) : (
        listening.canQueue &&
        listening.loaded && (
          <>
            <p>
              {listening.items.length} {listening.items.length === 1 ? 'entry' : 'entries'}
            </p>
            {!listening.items.length && <p>The speaker queue is empty.</p>}
            <ol>
              {listening.items.map((item, index) => (
                <li key={`${index}:${item.media_content_id ?? ''}`}>
                  <strong>{item.title || 'Untitled audio'}</strong>
                  {(item.artist || item.album) && <small>{[item.artist, item.album].filter(Boolean).join(' · ')}</small>}
                </li>
              ))}
            </ol>
          </>
        )
      )}
    </section>
  );
}
export function ListeningControls({ onOpenQueue }: { onOpenQueue(): void }) {
  const { listening, attributes, disabled, playback, favouritePlayback } = useCanvasMusic();
  if (!listening) return null;
  const blocked = disabled || listening.busy || playback.busy || !!favouritePlayback.pending;
  const shuffle = attributes?.shuffle;
  const repeat = attributes?.repeat;
  const nextRepeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
  return (
    <div className='canvas-player__listening' aria-label='Queue and playback modes' aria-busy={listening.busy}>
      <button aria-label='Open queue' onClick={onOpenQueue}>
        <CanvasActionIcon action='queue' size={18} /> Queue
      </button>
      <button
        aria-label='Shuffle'
        aria-pressed={shuffle === true}
        disabled={blocked || !listening.canShuffle || typeof shuffle !== 'boolean'}
        onClick={() => void listening.shuffle(!shuffle)}
      >
        <CanvasActionIcon action='shuffle' size={18} />
      </button>
      <button
        aria-label={`Repeat: ${repeat ?? 'unavailable'}`}
        aria-pressed={repeat === 'all' || repeat === 'one'}
        disabled={blocked || !listening.canRepeat || !['off', 'all', 'one'].includes(repeat ?? '')}
        onClick={() => void listening.repeat(nextRepeat)}
      >
        <CanvasActionIcon action='repeat' size={18} />
        {repeat === 'one' ? ' 1' : ''}
      </button>
      {listening.mutationStatus && <p role='status'>{listening.mutationStatus}</p>}
      {listening.mutationError && <p role='alert'>{listening.mutationError}</p>}
    </div>
  );
}

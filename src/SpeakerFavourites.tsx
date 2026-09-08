import { useEffect, useRef, useState } from 'react';
import { useHass, useIcon, useStore } from '@hakit/core';
import { useSpeakerCommand } from './useSpeakerCommand';

type Item = {
  title: string;
  media_content_id: string;
  media_content_type: string;
  can_play?: boolean;
  can_expand?: boolean;
  thumbnail?: string;
  children?: Item[];
};

export function SpeakerFavourites({
  entityId,
  destination,
  idle,
  disabled,
  open,
  onClose,
  onOpen,
  onCount,
}: {
  entityId: string;
  destination: string;
  idle: boolean;
  disabled: boolean;
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  onCount: (count: number | null) => void;
}) {
  const connection = useStore(state => state.connection);
  const { joinHassUrl } = useHass();
  const closeIcon = useIcon('mdi:close');
  const { send, error: commandError } = useSpeakerCommand();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<Item | null>(null);
  const [playError, setPlayError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const cancelWait = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelWait.current?.();
    };
  }, []);

  useEffect(() => {
    if ((!idle && !open) || disabled || !connection) return;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    async function read(type: string, id: string): Promise<Item> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          connection!.sendMessagePromise<Item>({
            type: 'media_player/browse_media',
            entity_id: entityId,
            media_content_type: type,
            media_content_id: id,
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Library timed out')), 15000);
            timers.add(timer);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        if (timer) timers.delete(timer);
      }
    }
    async function load() {
      setLoading(true);
      onCount(null);
      setLoadError(false);
      try {
        const found = new Map<string, Item>();
        const visited = new Set<string>();
        async function visit(type: string, id: string, depth = 0) {
          const key = type + ':' + id;
          if (visited.has(key)) return;
          if (depth > 5 || visited.size >= 50) throw new Error('Too many favourite folders');
          visited.add(key);
          const result = await read(type, id);
          for (const item of result.children ?? []) {
            if (cancelled) return;
            if (item.can_play) found.set(item.media_content_type + ':' + item.media_content_id, item);
            else if (item.can_expand) await visit(item.media_content_type, item.media_content_id, depth + 1);
          }
        }
        await visit('favorites', '');
        if (!cancelled) {
          setItems([...found.values()]);
          onCount(found.size);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [idle, open, disabled, connection, entityId, attempt, onCount]);

  useEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (open && !panel.open) panel.showModal();
    else if (!open && panel.open) panel.close();
  }, [open]);

  async function play(item: Item) {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(item);
    setPlayError('');
    const before = useStore.getState().entities[entityId];
    let stop = () => {};
    const confirmation = new Promise<boolean>(resolve => {
      let done = false;
      const finish = (result: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(result);
      };
      const unsubscribe = useStore.subscribe(state => {
        const next = state.entities[entityId];
        if (next?.state !== 'playing') return;
        const a = next.attributes;
        if (
          before?.state !== 'playing' ||
          a.media_content_id !== before?.attributes.media_content_id ||
          a.media_title !== before?.attributes.media_title ||
          a.media_playlist !== before?.attributes.media_playlist
        )
          finish(true);
      });
      const timer = setTimeout(() => finish(false), 20000);
      stop = () => finish(false);
      cancelWait.current = stop;
    });
    const sent = await send('play_media', [entityId], 'start ' + item.title, {
      media_content_id: item.media_content_id,
      media_content_type: item.media_content_type,
    });
    if (!sent) stop();
    const confirmed = await confirmation;
    if (mounted.current) {
      if (sent && confirmed) closeRef.current();
      else if (sent) setPlayError('Playback could not be confirmed. Tap a favourite to try again.');
      setPending(null);
    }
    cancelWait.current = null;
    inFlight.current = false;
  }

  function collection(all: boolean) {
    return (
      <>
        {loading ? (
          <p role='status'>Loading favourites…</p>
        ) : loadError ? (
          <p>
            Could not load favourites.{' '}
            <button className='speaker-favourites-more' onClick={() => setAttempt(x => x + 1)}>
              Retry favourites
            </button>
          </p>
        ) : items.length === 0 ? (
          <p className='speaker-rooms-hint'>Choose this speaker in your music app.</p>
        ) : (
          <div className='speaker-favourites-grid'>
            {(all ? items : items.slice(0, 12)).map(item => (
              <button
                key={item.media_content_type + item.media_content_id}
                type='button'
                className='speaker-favourite'
                aria-label={'Play ' + item.title}
                disabled={disabled || !!pending}
                onClick={() => void play(item)}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail.startsWith('/') ? joinHassUrl(item.thumbnail) : item.thumbnail} alt='' loading='lazy' />
                ) : (
                  <span className='speaker-favourite-placeholder' aria-hidden='true'>
                    ♫
                  </span>
                )}
                <span>{item.title}</span>
              </button>
            ))}
          </div>
        )}
        {!all && !loading && !loadError && items.length > 12 && (
          <button className='speaker-favourites-more' onClick={onOpen}>
            See all {items.length}
          </button>
        )}
      </>
    );
  }

  const status = (
    <>
      {pending && <p role='status'>Starting {pending.title}…</p>}
      {(playError || commandError) && (
        <p role='alert' className='speaker-command-error'>
          {playError || commandError}
        </p>
      )}
    </>
  );
  return (
    <>
      {idle && !disabled && (
        <div className='speaker-favourites-inline'>
          {collection(false)}
          {!open && status}
        </div>
      )}
      {!idle && !open && status}
      <dialog
        ref={dialog}
        className='speaker-details speaker-rooms-dialog'
        aria-label='Favourites'
        onClose={onClose}
        onCancel={event => {
          event.preventDefault();
          onClose();
        }}
        onClick={event => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {open && (
          <div className='speaker-rooms-layout'>
            <div className='speaker-rooms-top'>
              <div className='speaker-details-header'>
                <h2>Favourites</h2>
                <button className='speaker-control' aria-label='Close favourites' onClick={onClose}>
                  {closeIcon}
                </button>
              </div>
              <p>
                Play in <strong>{destination}</strong>
              </p>
              <p className='speaker-rooms-hint'>Choose a favourite to start it here.</p>
              {status}
            </div>
            <div className='speaker-favourites-body'>{collection(true)}</div>
          </div>
        )}
      </dialog>
    </>
  );
}

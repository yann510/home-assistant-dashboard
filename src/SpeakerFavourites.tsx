import { useEffect, useRef } from 'react';
import { useHass, useIcon } from '@hakit/core';
import { useSpeakerFavourites } from './useSpeakerFavourites';
import { useSpeakerFavouritePlayback } from './useSpeakerFavouritePlayback';

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
  const { joinHassUrl } = useHass();
  const closeIcon = useIcon('mdi:close');
  const dialog = useRef<HTMLDialogElement>(null);
  const { items, loading, error: loadError, retry } = useSpeakerFavourites(entityId, (idle || open) && !disabled, onCount);
  const { play, pending, playError, commandError } = useSpeakerFavouritePlayback(entityId, disabled, onClose);
  useEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (open && !panel.open) panel.showModal();
    else if (!open && panel.open) panel.close();
  }, [open]);

  function collection(all: boolean) {
    return (
      <>
        {loading ? (
          <p role='status'>Loading favourites…</p>
        ) : loadError ? (
          <p>
            Could not load favourites.{' '}
            <button className='speaker-favourites-more' onClick={retry}>
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

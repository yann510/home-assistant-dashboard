import { useEffect, useRef, useState } from 'react';
import { useIcon, type EntityName, type FilterByDomain } from '@hakit/core';
import { useSpeakerRooms } from './useSpeakerRooms';
import { SpeakerVolume } from './SpeakerVolume';

type SpeakerId = FilterByDomain<EntityName, 'media_player'>;
const rooms: SpeakerId[] = ['media_player.living_room', 'media_player.bathroom', 'media_player.bedroom', 'media_player.gym'];
export function SpeakerRooms({ source, members, disabled }: { source: SpeakerId; members: SpeakerId[]; disabled: boolean }) {
  const {
    entities,
    following,
    cleanupPending,
    name,
    selected,
    setSelected,
    busy,
    error,
    status,
    setStatus,
    current,
    locked,
    changed,
    begin: resetRooms,
    perform,
    pending,
    conflict,
  } = useSpeakerRooms({ source, members, disabled });
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const speakerIcon = useIcon('mdi:speaker');
  const chevron = useIcon('mdi:chevron-down');
  const closeIcon = useIcon('mdi:close');
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  function begin() {
    resetRooms();
    setOpen(true);
  }
  function close() {
    if (pending.current) return;
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <button
        ref={trigger}
        type='button'
        className='speaker-room-name speaker-room-picker'
        aria-label={`Playing in ${current.map(id => entities[id]?.attributes.friendly_name ?? id).join(', ')}`}
        aria-haspopup='dialog'
        aria-expanded={open}
        onClick={begin}
      >
        {speakerIcon}
        <span>
          {name}
          {current.length > 1 ? ` +${current.length - 1}` : ''}
        </span>
        {chevron}
      </button>
      <dialog
        ref={dialog}
        className='speaker-details speaker-rooms-dialog'
        aria-label='Play in'
        onCancel={event => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onClick={event => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {open && (
          <div className='speaker-rooms-layout'>
            <div className='speaker-rooms-top'>
              <div className='speaker-details-header'>
                <h2>Play in</h2>
                <button className='speaker-control' type='button' aria-label='Close room picker' disabled={busy} onClick={close}>
                  {closeIcon}
                </button>
              </div>
              <p>
                Use audio from <strong>{name}</strong>
              </p>
              <p className='speaker-rooms-hint'>Choose rooms. Adjust each room’s volume below.</p>
              {(following || cleanupPending) && (
                <div className='speaker-manual-notice'>
                  <p>{following ? 'Follow me controls rooms using motion.' : 'Finish switching modes before editing rooms.'}</p>
                  <button type='button' disabled={disabled || busy} onClick={() => void perform(true)}>
                    Switch to manual grouping
                  </button>
                </div>
              )}
              <div className='speaker-room-shortcuts'>
                <button
                  type='button'
                  disabled={locked}
                  onClick={() =>
                    setSelected([
                      ...new Set([source, ...rooms.filter(id => entities[id] && !['unknown', 'unavailable'].includes(entities[id].state))]),
                    ])
                  }
                >
                  All rooms
                </button>
                <button type='button' disabled={locked} onClick={() => setSelected([source])}>
                  Only {name}
                </button>
              </div>
            </div>
            <div className='speaker-room-list'>
              {rooms.map(id => {
                const entity = entities[id];
                const roomName = entity?.attributes.friendly_name ?? id;
                const available = Boolean(entity && !['unknown', 'unavailable'].includes(entity.state));
                const checked = selected.includes(id);
                const joined = current.includes(id);
                return (
                  <div key={id} className={`speaker-room-item${checked ? ' is-selected' : ''}`}>
                    <label className='speaker-room-choice'>
                      <input
                        type='checkbox'
                        checked={checked}
                        disabled={locked || id === source || !available}
                        onChange={() => {
                          setSelected(old => (checked ? old.filter(value => value !== id) : [...old, id]));
                          setStatus('');
                        }}
                      />
                      <span>
                        <strong>{roomName}</strong>
                        <small>
                          {!available
                            ? 'Unavailable'
                            : id === source
                              ? 'Audio source'
                              : checked && !joined
                                ? 'Will join when you apply'
                                : !checked && joined
                                  ? 'Will leave when you apply'
                                  : !joined && entity?.state === 'playing'
                                    ? `Playing ${entity.attributes.media_title ?? 'other audio'} · selection replaces this audio`
                                    : joined
                                      ? 'In this group'
                                      : 'Not grouped'}
                        </small>
                      </span>
                    </label>
                    {checked && joined && (
                      <SpeakerVolume entityId={id} targets={[id]} disabled={disabled || busy || !available} room={roomName} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className='speaker-rooms-footer'>
              {conflict && (
                <div role='alert'>
                  <p>{conflict.message}</p>
                  <button type='button' onClick={() => void perform(false, conflict.signature)}>
                    Replace audio and apply
                  </button>
                </div>
              )}
              {error && (
                <p role='alert' className='speaker-command-error'>
                  {error}
                </p>
              )}
              <p role='status' aria-label='Room update'>
                {status || (changed ? 'Room changes take effect when you apply.' : 'Volume changes take effect immediately.')}
              </p>
              <button
                type='button'
                className='speaker-rooms-apply'
                disabled={locked || (!changed && !error)}
                onClick={() => void perform()}
              >
                {busy ? 'Updating…' : error ? 'Retry' : 'Apply'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

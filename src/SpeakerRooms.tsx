import { useEffect, useRef, useState } from 'react';
import { useIcon, useStore, type EntityName, type FilterByDomain } from '@hakit/core';
import { SpeakerVolume } from './SpeakerVolume';

type SpeakerId = FilterByDomain<EntityName, 'media_player'>;
const rooms: SpeakerId[] = ['media_player.living_room', 'media_player.bathroom', 'media_player.bedroom', 'media_player.gym'];
const membersOf = (source: string) =>
  [...new Set([source, ...(useStore.getState().entities[source]?.attributes.group_members ?? [])])].sort();
const signature = (ids: string[]) => [...ids].sort().join(',');

function waitForState(check: () => boolean, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {};
    function finish(error?: Error) {
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    }
    const abort = () => finish(new Error('Cancelled.'));
    const inspect = () => {
      if (signal.aborted) return abort();
      const state = useStore.getState();
      if (!state.connection?.connected || state.connectionStatus !== 'connected')
        return finish(new Error('Reconnecting to Home Assistant.'));
      if (check()) finish();
    };
    const timer = setTimeout(() => finish(new Error('The speaker did not confirm the change. Please retry.')), 15000);
    unsubscribe = useStore.subscribe(inspect);
    signal.addEventListener('abort', abort, { once: true });
    inspect();
  });
}

async function service(domain: string, name: string, targets: string[], data: Record<string, unknown> | undefined, signal: AbortSignal) {
  const state = useStore.getState();
  if (signal.aborted) throw new Error('Cancelled.');
  if (!state.connection?.connected || state.connectionStatus !== 'connected') throw new Error('Reconnecting to Home Assistant.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      state.connection.sendMessagePromise({
        type: 'call_service',
        domain,
        service: name,
        target: { entity_id: targets },
        ...(data ? { service_data: data } : {}),
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Home Assistant did not respond. Please retry.')), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function SpeakerRooms({ source, members, disabled }: { source: SpeakerId; members: SpeakerId[]; disabled: boolean }) {
  const entities = useStore(state => state.entities);
  const following = entities['input_boolean.speaker_follow_motion']?.state === 'on';
  const cleanupPending =
    !following &&
    Boolean(entities['input_text.speaker_follow_source']?.state && entities['input_text.speaker_follow_source']?.state !== 'unknown');
  const scriptBusy = entities['script.speaker_follow_motion']?.state === 'on';
  const name = entities[source]?.attributes.friendly_name ?? 'Speaker';
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const original = useRef('');
  const pending = useRef(false);
  const active = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const speakerIcon = useIcon('mdi:speaker');
  const chevron = useIcon('mdi:chevron-down');
  const closeIcon = useIcon('mdi:close');
  const current = [...new Set([source, ...members])];
  const locked = disabled || busy || following || cleanupPending || scriptBusy;
  const changed = signature(selected) !== signature(current);

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);

  function begin() {
    setSelected(membersOf(source));
    original.current = signature(membersOf(source));
    setError(null);
    setStatus('');
    setOpen(true);
  }
  function close() {
    if (pending.current) return;
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  async function perform(manual = false) {
    if (pending.current || disabled || (!manual && locked)) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    active.current = controller;
    let action = 'update rooms';
    try {
      if (manual) {
        action = 'switch to manual grouping';
        setStatus('Switching to manual grouping…');
        // Stop new motion joins, then let any already running join finish.
        // Unlike the existing disable script, this leaves the group intact.
        await service('input_boolean', 'turn_off', ['input_boolean.speaker_follow_motion'], undefined, controller.signal);
        await waitForState(
          () =>
            useStore.getState().entities['input_boolean.speaker_follow_motion']?.state === 'off' &&
            useStore.getState().entities['script.speaker_follow_motion']?.state === 'off',
          controller.signal
        );
        await service('input_text', 'set_value', ['input_text.speaker_follow_source'], { value: '' }, controller.signal);
        await waitForState(() => useStore.getState().entities['input_text.speaker_follow_source']?.state === '', controller.signal);
        setSelected(membersOf(source));
        setStatus('Manual grouping is on. Your rooms are unchanged.');
      } else {
        if (!error && original.current !== signature(membersOf(source)))
          throw new Error('The group changed elsewhere. Close and reopen Play in to use the latest rooms.');
        const desired = [...new Set([source, ...selected])];
        const before = membersOf(source);
        const remove = before.filter(id => id !== source && !desired.includes(id));
        const add = desired.filter(id => !before.includes(id));
        for (const id of [...remove, ...add]) {
          if (controller.signal.aborted) return;
          const removing = remove.includes(id);
          const roomName = useStore.getState().entities[id]?.attributes.friendly_name ?? id;
          action = `${removing ? 'disconnect' : 'connect'} ${roomName}`;
          setStatus(`${removing ? 'Disconnecting' : 'Connecting'} ${roomName}…`);
          const entity = useStore.getState().entities[id];
          if (!entity || ['unknown', 'unavailable'].includes(entity.state)) throw new Error('This speaker is unavailable.');
          await service(
            'media_player',
            removing ? 'unjoin' : 'join',
            removing ? [id] : [source],
            removing ? undefined : { group_members: [id] },
            controller.signal
          );
          await waitForState(() => membersOf(source).includes(id) !== removing, controller.signal);
        }
        if (signature(membersOf(source)) !== signature(desired)) throw new Error('The group changed while applying. Please retry.');
        setStatus('Rooms updated.');
      }
      original.current = signature(membersOf(source));
    } catch (cause) {
      if (!controller.signal.aborted) {
        const detail = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Please retry.';
        setError(`Could not ${action}. ${detail}`);
        setStatus('');
      }
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
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

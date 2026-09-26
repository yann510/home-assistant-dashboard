import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, type EntityName, type FilterByDomain } from '@hakit/core';
import { onSpeakerDisconnect } from './speakerConnection';

type SpeakerId = FilterByDomain<EntityName, 'media_player'>;
const membersOf = (source: string) =>
  [...new Set([source, ...(useStore.getState().entities[source]?.attributes.group_members ?? [])])].sort();
const signature = (ids: string[]) => [...ids].sort().join(',');
const audioSignature = (id: string) => {
  const entity = useStore.getState().entities[id];
  return JSON.stringify([
    entity?.state,
    entity?.attributes.group_members,
    entity?.attributes.media_content_id,
    entity?.attributes.media_title,
    entity?.attributes.media_playlist,
  ]);
};

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
      try {
        if (check()) finish();
      } catch (cause) {
        finish(cause instanceof Error ? cause : new Error('The group changed while applying. Please retry.'));
      }
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
      new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled.')), { once: true })),
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

export function useSpeakerRooms({ source, members, disabled, onSourceChanged, pinSource }: {
  source: SpeakerId;
  members: SpeakerId[];
  disabled: boolean;
  onSourceChanged?: (source: string) => void;
  pinSource?: (source: string | null) => void;
}) {
  const entities = useStore(state => state.entities);
  const following = entities['input_boolean.speaker_follow_motion']?.state === 'on';
  const cleanupPending =
    !following &&
    Boolean(entities['input_text.speaker_follow_source']?.state && entities['input_text.speaker_follow_source']?.state !== 'unknown');
  const scriptBusy = entities['script.speaker_follow_motion']?.state === 'on';
  const name = entities[source]?.attributes.friendly_name ?? 'Speaker';
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyRoom, setBusyRoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const original = useRef('');
  const [conflict, setConflict] = useState<{ signature: string; message: string } | null>(null);
  const pending = useRef(false);
  const active = useRef<AbortController | null>(null);
  const current = [...new Set([source, ...members])];
  const locked = disabled || busy || following || cleanupPending || scriptBusy;
  const changed = signature(selected) !== signature(current);

  useEffect(() => {
    const unsubscribe = onSpeakerDisconnect(() => {
      const wasPending = pending.current;
      active.current?.abort();
      setBusy(false);
      pending.current = false;
      if (wasPending) setError('Connection interrupted. Reload current rooms before retrying.');
    });
    return () => {
      active.current?.abort();
      pending.current = false;
      unsubscribe();
    };
  }, [source]);
  const begin = useCallback((preserveFeedback: unknown = false) => {
    setBusy(false);
    setConflict(null);
    setSelected(membersOf(source));
    original.current = signature(membersOf(source));
    if (preserveFeedback !== true) {
      setError(null);
      setStatus('');
    }
  }, [source]);
  async function perform(manual = false, consent?: string, immediateSelection?: string[]) {
    const requested = immediateSelection ?? selected;
    if (pending.current || disabled || (!manual && locked)) return;
    if (!manual) {
      if (original.current !== signature(membersOf(source))) {
        setConflict(null);
        setError('Could not update rooms. The group changed elsewhere. Close and reopen speaker controls to use the latest rooms.');
        return;
      }
      const state = useStore.getState().entities;
      const adding = requested.filter(id => !membersOf(source).includes(id));
      const conflicts = adding.filter(
        id => ['playing', 'buffering', 'paused'].includes(state[id]?.state ?? '') || (state[id]?.attributes.group_members?.length ?? 0) > 1
      );
      const snapshot = JSON.stringify([
        membersOf(source),
        adding.map(id => [
          id,
          state[id]?.state,
          state[id]?.attributes.group_members,
          state[id]?.attributes.media_content_id,
          state[id]?.attributes.media_title,
          state[id]?.attributes.media_playlist,
        ]),
      ]);
      if (conflicts.length && consent !== snapshot) {
        setConflict({
          signature: snapshot,
          message:
            'This replaces audio in ' +
            conflicts
              .map(id => `${state[id]?.attributes.friendly_name ?? id}: ${state[id]?.attributes.media_title ?? 'other audio'}`)
              .join(', ') +
            '. Confirm to continue.',
        });
        return;
      }
    }
    setConflict(null);
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
        if (original.current !== signature(membersOf(source)))
          throw new Error('The group changed elsewhere. Close and reopen speaker controls to use the latest rooms.');
        const desired = [...new Set([source, ...requested])];
        const before = membersOf(source);
        const remove = before.filter(id => id !== source && !desired.includes(id));
        const add = desired.filter(id => !before.includes(id));
        let expectedMembers = before;
        const approvedAudio = new Map(add.map(id => [id, audioSignature(id)]));
        for (const id of [...remove, ...add]) {
          if (controller.signal.aborted) return;
          const removing = remove.includes(id);
          if (original.current !== signature(membersOf(source)))
            throw new Error('The group changed elsewhere. Reload current rooms before retrying.');
          if (!removing && audioSignature(id) !== approvedAudio.get(id))
            throw new Error('Audio changed in another room. Review and confirm the rooms again.');
          const roomName = useStore.getState().entities[id]?.attributes.friendly_name ?? id;
          action = `${removing ? 'disconnect' : 'connect'} ${roomName}`;
          setStatus(`${removing ? 'Disconnecting' : 'Connecting'} ${roomName}…`);
          setBusyRoom(id);
          const entity = useStore.getState().entities[id];
          if (!entity || ['unknown', 'unavailable'].includes(entity.state)) throw new Error('This speaker is unavailable.');
          await service(
            'media_player',
            removing ? 'unjoin' : 'join',
            removing ? [id] : [source],
            removing ? undefined : { group_members: [id] },
            controller.signal
          );
          const unaffected = signature(expectedMembers.filter(member => member !== id));
          await waitForState(() => {
            const observed = membersOf(source);
            if (signature(observed.filter(member => member !== id)) !== unaffected)
              throw new Error('The group changed elsewhere while applying. Reload current rooms before retrying.');
            return observed.includes(id) !== removing;
          }, controller.signal);
          // Advance only by this operation, never adopt unrelated observed mutations.
          expectedMembers = removing ? expectedMembers.filter(member => member !== id) : [...expectedMembers, id];
          original.current = signature(expectedMembers);
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
      if (active.current === controller) {
        setBusyRoom(null);
        pending.current = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }

  async function removeSource() {
    const before = membersOf(source);
    const remaining = before.filter(id => id !== source);
    if (!onSourceChanged || !pinSource || !remaining.length || locked || pending.current) return;
    pending.current = true;
    pinSource(source);
    setBusy(true);
    setBusyRoom(source);
    setError(null);
    setStatus('Moving playback…');
    setConflict(null);
    const controller = new AbortController();
    active.current = controller;
    let nextSource: string | undefined;
    const originalEntity = useStore.getState().entities[source];
    const wasPlaying = ['playing', 'buffering'].includes(originalEntity?.state ?? '');
    const mediaMatches = (id: string) => {
      const attributes = useStore.getState().entities[id]?.attributes;
      const originalAttributes = originalEntity?.attributes;
      return Boolean(attributes && originalAttributes && (originalAttributes.media_content_id
        ? attributes.media_content_id === originalAttributes.media_content_id
        : originalAttributes.media_title && attributes.media_title === originalAttributes.media_title &&
          attributes.media_artist === originalAttributes.media_artist));
    };
    const readTopology = () => {
      const state = useStore.getState().entities;
      for (const id of before) {
        if (!state[id] || ['unknown', 'unavailable'].includes(state[id].state))
          throw new Error('A speaker became unavailable. Check the current rooms before retrying.');
        const observed = membersOf(id);
        // HA publishes each speaker separately: accept the old or final snapshot,
        // but never adopt an unrelated regrouping as a successful handoff.
        const expected = id === source ? [source] : remaining;
        if (signature(observed) !== signature(before) && signature(observed) !== signature(expected))
          throw new Error('The group changed elsewhere. Check the current rooms before retrying.');
      }
      const candidate = state[remaining[0]].attributes.group_members?.[0] ?? remaining[0];
      const confirmed = membersOf(source).length === 1 && remaining.every(id =>
        signature(membersOf(id)) === signature(remaining) &&
        (state[id].attributes.group_members?.[0] ?? id) === candidate
      );
      if (!confirmed) return false;
      if (!remaining.includes(candidate)) throw new Error('The new main speaker could not be confirmed.');
      nextSource = candidate;
      return true;
    };
    try {
      readTopology();
      await service('media_player', 'unjoin', [source], undefined, controller.signal);
      await waitForState(readTopology, controller.signal);
      // Unjoin preserves the queue on the remaining Sonos group. Only pause the
      // detached speaker after every affected entity confirms that separation.
      if (!readTopology()) throw new Error('The group changed before playback could be moved.');
      if (['playing', 'buffering'].includes(useStore.getState().entities[source]?.state ?? '')) {
        if (!mediaMatches(source)) throw new Error('Audio changed on the removed speaker. Its new playback was left untouched.');
        await service('media_player', 'media_pause', [source], undefined, controller.signal);
        await waitForState(() => {
          if (!readTopology()) throw new Error('The group changed while stopping the removed speaker.');
          return !['playing', 'buffering'].includes(useStore.getState().entities[source]?.state ?? '');
        }, controller.signal);
      }
      if (wasPlaying && nextSource && useStore.getState().entities[nextSource]?.state === 'paused') {
        if (!mediaMatches(nextSource)) throw new Error('Playback moved, but the remaining audio could not be verified. Resume it from the player.');
        if (!readTopology()) throw new Error('The group changed before playback could resume.');
        await service('media_player', 'media_play', [nextSource], undefined, controller.signal);
        await waitForState(() => {
          if (!readTopology() || !mediaMatches(nextSource!)) throw new Error('Audio changed while resuming. Check the player.');
          return ['playing', 'buffering'].includes(useStore.getState().entities[nextSource!]?.state ?? '');
        }, controller.signal);
      }
      if (wasPlaying && nextSource && !['playing', 'buffering'].includes(useStore.getState().entities[nextSource]?.state ?? ''))
        throw new Error('The rooms changed, but playback stopped. Resume playback from the player.');
      setStatus('Rooms updated.');
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(`Could not finish moving playback. ${cause instanceof Error ? cause.message : 'Please retry.'}`);
        setStatus('');
      }
    } finally {
      if (active.current === controller) {
        // A confirmed group is still the right source if pausing the detached
        // speaker failed. Preserve the error so the partial result stays visible.
        if (!controller.signal.aborted && nextSource) {
          original.current = signature(membersOf(nextSource));
          setSelected(membersOf(nextSource));
          onSourceChanged(nextSource);
        }
        pinSource(null);
        pending.current = false;
        setBusyRoom(null);
        setBusy(false);
      }
    }
  }

  async function toggleRoom(id: string) {
    if (locked || pending.current) return;
    if (id === source) {
      await removeSource();
      return;
    }
    const entity = useStore.getState().entities[id];
    if (!entity || ['unknown', 'unavailable'].includes(entity.state)) return;
    const latest = membersOf(source);
    const desired = latest.includes(id) ? latest.filter(member => member !== id) : [...latest, id];
    // Immediate actions always start with the latest confirmed group, never a stale draft.
    original.current = signature(latest);
    setSelected(desired);
    setError(null);
    setStatus('');
    await perform(false, undefined, desired);
  }

  return {
    entities,
    busyRoom,
    toggleRoom,
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
    begin,
    perform,
    pending,
    conflict,
  };
}

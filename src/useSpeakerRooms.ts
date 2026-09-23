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

export function useSpeakerRooms({ source, members, disabled }: { source: SpeakerId; members: SpeakerId[]; disabled: boolean }) {
  const entities = useStore(state => state.entities);
  const following = entities['input_boolean.speaker_follow_motion']?.state === 'on';
  const cleanupPending =
    !following &&
    Boolean(entities['input_text.speaker_follow_source']?.state && entities['input_text.speaker_follow_source']?.state !== 'unknown');
  const scriptBusy = entities['script.speaker_follow_motion']?.state === 'on';
  const name = entities[source]?.attributes.friendly_name ?? 'Speaker';
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
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
  const begin = useCallback(() => {
    setBusy(false);
    setConflict(null);
    setSelected(membersOf(source));
    original.current = signature(membersOf(source));
    setError(null);
    setStatus('');
  }, [source]);
  async function perform(manual = false, consent?: string) {
    if (pending.current || disabled || (!manual && locked)) return;
    if (!manual) {
      if (original.current !== signature(membersOf(source))) {
        setConflict(null);
        setError('Could not update rooms. The group changed elsewhere. Close and reopen Play in to use the latest rooms.');
        return;
      }
      const state = useStore.getState().entities;
      const adding = selected.filter(id => !membersOf(source).includes(id));
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
          throw new Error('The group changed elsewhere. Close and reopen Play in to use the latest rooms.');
        const desired = [...new Set([source, ...selected])];
        const before = membersOf(source);
        const remove = before.filter(id => id !== source && !desired.includes(id));
        const add = desired.filter(id => !before.includes(id));
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
          original.current = signature(membersOf(source));
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
        pending.current = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }

  return {
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
    begin,
    perform,
    pending,
    conflict,
  };
}

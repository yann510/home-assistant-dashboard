import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useEntity, useStore } from '@hakit/core';
import { onSpeakerDisconnect, subscribeSpeakerConnectionChanged } from './speakerConnection';

export const speakerIds = ['media_player.living_room', 'media_player.bathroom', 'media_player.bedroom', 'media_player.gym'] as const;

export function useSpeakerSession(allowIdleSource = false) {
  const speakers = [
    useEntity('media_player.living_room', { returnNullIfNotFound: true }),
    useEntity('media_player.bathroom', { returnNullIfNotFound: true }),
    useEntity('media_player.bedroom', { returnNullIfNotFound: true }),
    useEntity('media_player.gym', { returnNullIfNotFound: true }),
  ];
  const followMode = useEntity('input_boolean.speaker_follow_motion', { returnNullIfNotFound: true });
  const followSource = useEntity('input_text.speaker_follow_source', { returnNullIfNotFound: true });
  const followScript = useEntity('script.speaker_follow_motion', { returnNullIfNotFound: true });
  const connection = useStore(state => state.connection);
  const connected = useSyncExternalStore(subscribeSpeakerConnectionChanged, () => {
    const state = useStore.getState();
    return Boolean(state.connection?.connected && state.connectionStatus === 'connected');
  });
  const inFlight = useRef(false);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
      active.current?.abort();
      inFlight.current = false;
    };
    const unsubscribe = onSpeakerDisconnect(() => {
      const wasPending = inFlight.current;
      invalidate();
      setBusy(false);
      if (wasPending) setError('Follow me command interrupted. Reconnecting to Home Assistant. Check the current state before retrying.');
    });
    return () => {
      invalidate();
      unsubscribe();
    };
  }, []);
  const available = speakers.filter(
    (speaker): speaker is NonNullable<typeof speaker> => speaker !== null && !['unavailable', 'unknown'].includes(speaker.state)
  );

  const following = followMode?.state === 'on';
  const savedSource = speakerIds.find(id => id === followSource?.state);
  const cleanupPending = !following && Boolean(savedSource);
  // Disabling clears the mode before unjoining and clearing the saved source.
  // That intermediate state is progress, not a failed cleanup.
  const updating = busy || followScript?.state === 'on';
  const canRetryCleanup = cleanupPending && !updating && followScript?.state === 'off';
  const configured = [followMode, followSource, followScript].every(entity => entity && !['unknown', 'unavailable'].includes(entity.state));
  // Keep controlling the saved source while following, even if another room starts audio.
  const [preferredSource, setPreferredSource] = useState<string | null>(null);
  const selected =
    (following || cleanupPending ? speakers.find(speaker => speaker?.entity_id === savedSource) : undefined) ??
    speakers.find(speaker => speaker?.entity_id === preferredSource) ??
    available.find(speaker => ['playing', 'buffering'].includes(speaker.state)) ??
    available.find(speaker => (speaker.attributes.group_members?.length ?? 0) > 1) ??
    available.find(speaker => speaker.state === 'paused') ??
    (allowIdleSource ? available[0] : undefined);
  const coordinatorId = selected?.attributes.group_members?.[0] ?? selected?.entity_id;
  const coordinator = speakers.find(speaker => speaker?.entity_id === coordinatorId);
  const members = selected?.attributes.group_members ?? (coordinatorId ? [coordinatorId] : []);
  const canToggle = Boolean(
    connected && configured && !cleanupPending && (following || (coordinator && !['unavailable', 'unknown'].includes(coordinator.state)))
  );

  async function updateFollowing(command: 'enable' | 'disable') {
    if (inFlight.current || updating || !connected || !configured || !connection) return;
    const request = ++generation.current;
    const controller = new AbortController();
    active.current = controller;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Reuse the authenticated socket, including when embedded in the HA app.
      // Separate HTTP calls can target the wrong origin or use an expired token.
      const result = await Promise.race([
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener('abort', () => reject(new Error('Cancelled.')), { once: true })
        ),
        connection.sendMessagePromise<{ response?: { success?: boolean; error?: string } }>({
          type: 'call_service',
          domain: 'script',
          service: 'speaker_follow_motion',
          return_response: true,
          service_data: command === 'enable' ? { command, source_entity: coordinatorId } : { command },
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Home Assistant did not respond.')), 30000);
        }),
      ]);
      if (result.response?.success !== true) {
        throw new Error(result.response?.error ?? 'Home Assistant did not finish the command. Please try again.');
      }
    } catch (cause) {
      const detail = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Please try again.';
      if (request === generation.current)
        setError(`Could not ${command === 'enable' ? 'enable' : 'finish turning off'} Follow me. ${detail}`);
    } finally {
      clearTimeout(timeout);
      if (request === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  const entityId = speakerIds.find(id => id === coordinator?.entity_id) ?? 'media_player.living_room';
  const targets = [...new Set([entityId, ...speakerIds.filter(id => members.includes(id))])];
  return {
    speakers,
    entityId,
    targets,
    coordinator,
    following,
    cleanupPending,
    updating,
    canRetryCleanup,
    configured,
    connected,
    canToggle,
    busy,
    error,
    updateFollowing,
    preferredSource,
    setPreferredSource,
  };
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStore } from '@hakit/core';
import { onSpeakerDisconnect } from '../speakerConnection';
import { useSpeakerCommand } from '../useSpeakerCommand';
import type { MusicItem } from './useSpotifyBrowser';
export type QueueItem = { title?: string; artist?: string; album?: string; media_content_id?: string };
type Services = Record<string, Record<string, unknown>>;
export function spotifyEnqueue(item: MusicItem) {
  if (!item.can_play) return null;
  const match = /^(?:spotify:\/\/[^/]+\/)?(spotify:(track|album|playlist):[A-Za-z0-9]{22})$/.exec(item.media_content_id);
  if (!match) return null;
  const kind = match[2];
  return { media_content_id: match[1], media_content_type: kind === 'track' ? 'music' : kind };
}
export function useListening(
  entityId: string,
  enabled: boolean,
  features: number,
  blocked: () => boolean,
  onMutation?: () => void,
  sharedPending?: RefObject<boolean>
) {
  const connection = useStore(state => state.connection);
  const status = useStore(state => state.connectionStatus);
  const live = useRef({ entityId, enabled, connection, status, blocked, onMutation, features, services: {} as Services });

  const generation = useRef(0);
  const requestVersion = useRef(0);
  const queueAbort = useRef<AbortController | null>(null);
  const [epoch, setEpoch] = useState(0);
  const scope = useMemo(() => ({ entityId, enabled, connection, status, epoch }), [entityId, enabled, connection, status, epoch]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const activeScope = useRef<typeof scope | null>(null);
  const ownPending = useRef(false);
  const pending = sharedPending ?? ownPending;
  const [busy, setBusy] = useState(false);
  const [errorScope, setErrorScope] = useState<typeof scope | null>(null);
  const [mutationStatus, setMutationStatus] = useState('');
  const [services, setServices] = useState<Services>({});
  const [queue, setQueue] = useState<{ items: QueueItem[]; loading: boolean; error: string; loaded: boolean }>({
    items: [],
    loading: false,
    error: '',
    loaded: false,
  });
  useLayoutEffect(() => {
    live.current = { entityId, enabled, connection, status, blocked, onMutation, features, services };
  });
  const { send, error } = useSpeakerCommand(entityId);
  useEffect(() => {
    activeScope.current = scope;
    const lifetime = ++generation.current;
    const lifecycle = generation;
    const requests = requestVersion;
    const queueRequest = queueAbort;
    let cancelled = false;
    // A new authenticated source lifetime invalidates the previous read and feedback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMutationStatus('');
    setServices({});
    setQueue({ items: [], loading: false, error: '', loaded: false });
    const unsubscribe = onSpeakerDisconnect(() => {
      cancelled = true;
      activeScope.current = null;
      queueRequest.current?.abort();
      setErrorScope(null);
      generation.current++;
      setMutationStatus('');
      setServices({});
      setQueue({ items: [], loading: false, loaded: false, error: 'Connection lost. Refresh when Home Assistant reconnects.' });
    });
    const ready = () => setEpoch(value => value + 1);
    connection?.addEventListener?.('ready', ready);
    let discoveryTimer: ReturnType<typeof setTimeout> | undefined;
    if (enabled && connection?.connected && status === 'connected') {
      void Promise.race([
        connection.sendMessagePromise<Services>({ type: 'get_services' }),
        new Promise<never>((_, reject) => {
          discoveryTimer = setTimeout(() => reject(new Error('Service discovery timed out.')), 15000);
        }),
      ])
        .then(value => {
          if (!cancelled && lifetime === generation.current) setServices(value);
        })
        .catch(() => {
          if (!cancelled)
            setQueue({ items: [], loading: false, loaded: false, error: 'Could not discover speaker services. Refresh to retry.' });
        })
        .finally(() => clearTimeout(discoveryTimer));
    }
    return () => {
      cancelled = true;
      if (activeScope.current === scope) activeScope.current = null;
      lifecycle.current++;
      requests.current++;
      queueRequest.current?.abort();
      clearTimeout(discoveryTimer);
      unsubscribe();
      connection?.removeEventListener?.('ready', ready);
    };
  }, [entityId, enabled, connection, status, scope]);
  const canQueue = !!services.sonos?.get_queue;
  const canEnqueue = !!services.media_player?.play_media && !!(features & 2097152);
  const canShuffle = !!services.media_player?.shuffle_set && !!(features & 32768);
  const canRepeat = !!services.media_player?.repeat_set && !!(features & 262144);
  function current() {
    const state = useStore.getState();
    return (
      activeScope.current === scope &&
      live.current.entityId === entityId &&
      live.current.enabled &&
      live.current.connection === state.connection &&
      state.connection?.connected &&
      state.connectionStatus === 'connected'
    );
  }
  async function refresh() {
    if (!current() || !canQueue) return;
    const lifetime = ++requestVersion.current;
    queueAbort.current?.abort();
    const abort = new AbortController();
    queueAbort.current = abort;
    setQueue({ items: [], loading: true, error: '', loaded: false });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        useStore
          .getState()
          .connection!.sendMessagePromise<{ response?: Record<string, unknown> }>({
            type: 'call_service',
            domain: 'sonos',
            service: 'get_queue',
            target: { entity_id: entityId },
            return_response: true,
          }),
        new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true })),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('The speaker did not respond.')), 15000);
        }),
      ]);
      if (lifetime !== requestVersion.current || !current()) return;
      const entries = value.response?.[entityId];
      if (!Array.isArray(entries)) throw new Error('The speaker returned an unsupported queue response.');
      setQueue({
        loaded: true,
        items: entries.filter((item): item is QueueItem => !!item && typeof item === 'object'),
        loading: false,
        error: '',
      });
    } catch (cause) {
      if (lifetime === requestVersion.current && current())
        setQueue({
          items: [],
          loading: false,
          loaded: false,
          error: `Could not load queue. ${cause instanceof Error ? cause.message : 'Try refreshing.'}`,
        });
    } finally {
      clearTimeout(timer);
      if (queueAbort.current === abort) queueAbort.current = null;
    }
  }
  async function mutate(service: 'play_media' | 'shuffle_set' | 'repeat_set', data: Record<string, string | boolean>, description: string) {
    const capability = service === 'play_media' ? 2097152 : service === 'shuffle_set' ? 32768 : 262144;
    if (
      !current() ||
      !(live.current.features & capability) ||
      !live.current.services.media_player?.[service] ||
      pending.current ||
      live.current.blocked()
    )
      return false;
    pending.current = true;
    setBusy(true);
    setErrorScope(scope);
    setMutationStatus('');
    live.current.onMutation?.();
    try {
      return await send(service, [entityId], description, data);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function enqueue(item: MusicItem, position: 'next' | 'add') {
    const media = spotifyEnqueue(item);
    if (!media || !canEnqueue) return false;
    const success = await mutate('play_media', { ...media, enqueue: position }, position === 'next' ? 'play next' : 'add to queue');
    if (success && current()) setMutationStatus(position === 'next' ? `${item.title} will play next.` : `Added ${item.title} to queue.`);
    return success;
  }
  return {
    items: queue.items,
    loading: queue.loading,
    loaded: queue.loaded,
    queueError: queue.error,
    mutationStatus,
    refresh,
    retryDiscovery: () => setEpoch(value => value + 1),
    canQueue,
    canEnqueue,
    canShuffle,
    canRepeat,
    enqueue,
    pending,
    busy,
    mutationError: errorScope === scope ? error : null,
    shuffle: (value: boolean) => (canShuffle ? mutate('shuffle_set', { shuffle: value }, 'change shuffle') : Promise.resolve(false)),
    repeat: (value: 'off' | 'all' | 'one') =>
      canRepeat ? mutate('repeat_set', { repeat: value }, 'change repeat') : Promise.resolve(false),
  };
}

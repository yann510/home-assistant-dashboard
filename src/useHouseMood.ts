import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import type { HouseMoodCardProps, MoodId, MoodPhase, MoodStatus } from './moodTypes';

const phases: MoodPhase[] = ['idle', 'starting', 'active', 'restoring', 'recovery_required'];
const moodIds: MoodId[] = ['love', 'unwind', 'dinner', 'party', 'gym'];
const moodEntityId = 'sensor.house_mood';
const busy = (phase: unknown) => phase === 'starting' || phase === 'restoring';
const idle: MoodStatus = { phase: 'idle', activeMood: null, pendingMood: null, errors: [] };
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const mood = (value: unknown) => (moodIds.includes(value as MoodId) ? (value as MoodId) : null);
function errors(value: unknown): MoodStatus['errors'] {
  return Array.isArray(value)
    ? value.flatMap(item => {
        const e = record(item);
        return typeof e.message === 'string' ? [{ target: typeof e.target === 'string' ? e.target : 'house', message: e.message }] : [];
      })
    : [];
}

function readStatus(phase: unknown, attributes: unknown): MoodStatus | null {
  const attrs = record(attributes);
  if (!phases.includes(phase as MoodPhase) || (phase === 'active' && !mood(attrs.active_mood))) return null;
  return {
    phase: phase as MoodPhase,
    activeMood: mood(attrs.active_mood),
    pendingMood: mood(attrs.pending_mood),
    errors: errors(attrs.errors),
  };
}

export function useHouseMood(): HouseMoodCardProps {
  const entity = useStore(state => state.entities[moodEntityId]);
  const connection = useStore(state => state.connection);
  const connectionStatus = useStore(state => state.connectionStatus);
  const connected = Boolean(connection?.connected && connectionStatus === 'connected');
  const server = readStatus(entity?.state, entity?.attributes);
  const [local, setLocal] = useState<{ entity: unknown; status: MoodStatus; uncertain?: boolean; checked?: boolean } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const active = useRef<{ entity: unknown } | null>(null);
  const cancelCheck = useRef<(() => void) | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);
  const latestEntity = useRef(entity);
  const currentLocal = local?.entity === entity ? local : null;
  const available = Boolean(server || currentLocal?.checked);
  const status = currentLocal?.status ?? server ?? idle;
  const canCheckStatus = Boolean(local?.uncertain && (currentLocal || !server || busy(server.phase)));

  useEffect(() => {
    mounted.current = true;
    const runningTimers = timers.current;
    return () => {
      mounted.current = false;
      active.current = null;
      cancelCheck.current?.();
      runningTimers.forEach(clearTimeout);
      runningTimers.clear();
    };
  }, []);
  useLayoutEffect(() => {
    latestEntity.current = entity;
    // A fresh terminal sensor update is authoritative even if its service response was lost.
    const reported = readStatus(entity?.state, entity?.attributes);
    if (active.current && active.current.entity !== entity && reported && !busy(reported.phase)) {
      active.current = null;
      cancelCheck.current?.();
    }
  }, [entity]);

  async function send(service: 'activate' | 'end' | 'retry_restoration', requested?: MoodId) {
    if (!connected || !available || !connection || active.current || busy(status.phase)) return;
    if (service === 'activate' && (status.phase === 'recovery_required' || requested === status.activeMood)) return;
    if (service === 'end' && !status.activeMood) return;
    if (service === 'retry_restoration' && status.phase !== 'recovery_required') return;
    const operation = { entity };
    active.current = operation;
    const pending: MoodStatus = {
      ...status,
      phase: service === 'activate' ? 'starting' : 'restoring',
      pendingMood: requested ?? null,
      errors: [],
    };
    setLocal({ entity, status: pending });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        connection.sendMessagePromise<{ response?: Record<string, unknown> }>({
          type: 'call_service',
          domain: 'house_moods',
          service,
          return_response: true,
          ...(requested ? { service_data: { mood: requested } } : {}),
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Waiting for Home Assistant to confirm the change.')), 35000);
          timers.current.add(timer);
        }),
      ]);
      if (!mounted.current || active.current !== operation) return;
      const response = result.response;
      const next = readStatus(response?.phase, response);
      if (!next || typeof response?.success !== 'boolean') {
        throw new Error('Waiting for Home Assistant to confirm the change.');
      }
      setLocal({
        entity: latestEntity.current,
        status: {
          ...next,
          activeMood: next.phase === 'active' ? next.activeMood : null,
          pendingMood: next.phase === 'starting' ? next.pendingMood : null,
        },
        uncertain: busy(next.phase),
      });
      if (!busy(next.phase)) active.current = null;
    } catch {
      if (!mounted.current || active.current !== operation) return;
      // A transport error cannot prove whether a physical command ran. Keep the lock
      // until the status entity confirms the outcome; do not offer an unsafe re-send.
      setLocal({
        entity: latestEntity.current,
        status: { ...pending, errors: [{ target: 'house', message: 'Waiting for Home Assistant to confirm the change.' }] },
        uncertain: true,
      });
    } finally {
      clearTimeout(timer);
      if (timer) timers.current.delete(timer);
    }
  }

  async function checkStatus() {
    const operation = active.current;
    if (!connected || !connection || !canCheckStatus || !operation || cancelCheck.current) return;
    const checkedEntity = useStore.getState().entities[moodEntityId];
    setCheckingStatus(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disconnected = false;
    const interrupted = 'Connection changed during the status check. Please try again.';
    const timeoutOrDisconnect = new Promise<never>((_, reject) => {
      cancelCheck.current = () => {
        disconnected = true;
        reject(new Error(interrupted));
      };
      timer = setTimeout(() => reject(new Error('Status check timed out. Please try again.')), 15000);
    });
    const connectionChanged = cancelCheck.current!;
    connection.addEventListener?.('disconnected', connectionChanged);
    connection.addEventListener?.('ready', connectionChanged);
    try {
      const states = await Promise.race([connection.sendMessagePromise<unknown>({ type: 'get_states' }), timeoutOrDisconnect]);
      if (!mounted.current || active.current !== operation) return;
      const latest = useStore.getState();
      if (disconnected || latest.connection !== connection || !connection.connected || latest.connectionStatus !== 'connected')
        throw new Error(interrupted);
      const latestMood = latest.entities[moodEntityId];
      // A snapshot response can arrive after a newer subscription update.
      const published = latestMood !== checkedEntity ? readStatus(latestMood?.state, latestMood?.attributes) : null;
      const fresh: unknown = Array.isArray(states) ? states.find(state => record(state).entity_id === moodEntityId) : undefined;
      const attrs = record(fresh);
      const next = published ?? readStatus(attrs.state, attrs.attributes);
      if (!next) throw new Error('Mood status is unavailable. Please try again.');
      if (busy(next.phase)) throw new Error('The mood operation is still in progress. Check status again shortly.');
      active.current = null;
      setLocal({ entity: latestMood, status: next, checked: true });
    } catch (error) {
      if (mounted.current && active.current === operation) {
        const message = error instanceof Error ? error.message : 'Status check failed. Please try again.';
        const latestMood = useStore.getState().entities[moodEntityId];
        const reported = latestMood !== checkedEntity ? readStatus(latestMood?.state, latestMood?.attributes) : null;
        if (reported && !busy(reported.phase)) {
          active.current = null;
          setLocal({ entity: latestMood, status: reported });
        } else {
          setLocal({ entity: latestMood, status: { ...(reported ?? status), errors: [{ target: 'house', message }] }, uncertain: true });
        }
      }
    } finally {
      clearTimeout(timer);
      connection.removeEventListener?.('disconnected', connectionChanged);
      connection.removeEventListener?.('ready', connectionChanged);
      cancelCheck.current = null;
      if (mounted.current) setCheckingStatus(false);
    }
  }

  return {
    status,
    connected,
    available,
    canCheckStatus,
    checkingStatus,
    onCheckStatus: checkStatus,
    onActivate: id => {
      void send('activate', id);
    },
    onEnd: () => {
      void send('end');
    },
    onRetry: () => {
      void send('retry_restoration');
    },
  };
}

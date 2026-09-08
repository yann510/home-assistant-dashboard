import { useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import type { HouseMoodCardProps, MoodId, MoodPhase, MoodStatus } from './HouseMoodCard';

const phases: MoodPhase[] = ['idle', 'starting', 'active', 'restoring', 'recovery_required'];
const moodIds: MoodId[] = ['love', 'unwind', 'dinner', 'party'];
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

export function useHouseMood(): HouseMoodCardProps {
  const entity = useStore(state => state.entities['sensor.house_mood']);
  const connection = useStore(state => state.connection);
  const connectionStatus = useStore(state => state.connectionStatus);
  const connected = Boolean(connection?.connected && connectionStatus === 'connected');
  const available = Boolean(entity && phases.includes(entity.state as MoodPhase));
  const attrs = record(entity?.attributes);
  const server: MoodStatus = available
    ? {
        phase: entity.state as MoodPhase,
        activeMood: mood(attrs.active_mood),
        pendingMood: mood(attrs.pending_mood),
        errors: errors(attrs.errors),
      }
    : idle;
  const [local, setLocal] = useState<{ entity: unknown; status: MoodStatus } | null>(null);
  const active = useRef<{ entity: unknown; id: symbol } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);
  const status = local?.entity === entity ? local.status : server;

  useEffect(() => {
    mounted.current = true;
    const runningTimers = timers.current;
    return () => {
      mounted.current = false;
      active.current = null;
      runningTimers.forEach(clearTimeout);
      runningTimers.clear();
    };
  }, []);
  useEffect(() => {
    // A fresh terminal sensor update is authoritative even if its service response was lost.
    if (active.current && active.current.entity !== entity && ['idle', 'active', 'recovery_required'].includes(entity?.state ?? '')) {
      active.current = null;
    }
  }, [entity]);

  async function send(service: 'activate' | 'end' | 'retry_restoration', requested?: MoodId) {
    if (!connected || !available || !connection || active.current || ['starting', 'restoring'].includes(status.phase)) return;
    if (service === 'activate' && (status.phase === 'recovery_required' || requested === status.activeMood)) return;
    if (service === 'end' && !status.activeMood) return;
    if (service === 'retry_restoration' && status.phase !== 'recovery_required') return;
    const operation = { entity, id: Symbol(service) };
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
      if (!response || !phases.includes(response.phase as MoodPhase) || typeof response.success !== 'boolean') {
        throw new Error('Waiting for Home Assistant to confirm the change.');
      }
      const phase = response.phase as MoodPhase;
      setLocal({
        entity,
        status: {
          phase,
          activeMood: phase === 'active' ? (requested ?? status.activeMood) : null,
          pendingMood: phase === 'starting' ? (requested ?? null) : null,
          errors: errors(response.errors),
        },
      });
      active.current = ['starting', 'restoring'].includes(phase) ? operation : null;
    } catch {
      if (!mounted.current || active.current !== operation) return;
      // A transport error cannot prove whether a physical command ran. Keep the lock
      // until the status entity confirms the outcome; do not offer an unsafe re-send.
      setLocal({
        entity,
        status: { ...pending, errors: [{ target: 'house', message: 'Waiting for Home Assistant to confirm the change.' }] },
      });
    } finally {
      clearTimeout(timer);
      if (timer) timers.current.delete(timer);
    }
  }
  return {
    status,
    connected,
    available,
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

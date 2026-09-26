import { useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { ERR_CONNECTION_LOST } from 'home-assistant-js-websocket';
import type { TargetResult } from './commands';

const choices = [
  { label: 'Day', mode: 'day', id: 'input_boolean.morning_mode' },
  { label: 'Night', mode: 'night', id: 'input_boolean.night_mode' },
] as const;

export function useCanvasModes() {
  const entities = useStore(store => store.entities);
  const connected = useStore(store => Boolean(store.connection?.connected && store.connectionStatus === 'connected'));
  const mood = entities['sensor.house_mood'];
  const coordinated = mood?.attributes.mode_control === 'coordinated-v1';
  const phase = mood?.state;
  const busy = phase === 'starting' || phase === 'restoring' || phase === 'recovery_required';
  const unsafeLegacy = !coordinated && phase !== undefined && phase !== 'idle';
  const validHelpers = choices.every(choice => ['on', 'off'].includes(entities[choice.id]?.state));
  const [feedback, setFeedback] = useState<Record<string, TargetResult>>({});
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  const mounted = useRef(true);
  const dispose = useRef<() => void>(() => {});
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dispose.current();
    };
  }, []);
  return choices.map(choice => {
    const state = entities[choice.id]?.state;
    const disabled = !connected || !validHelpers || pending || busy || unsafeLegacy || (!coordinated && state === 'on');
    return {
      label: choice.label,
      state,
      disabled,
      disabledReason: busy ? 'Finish the current mood operation or recovery before changing mode.' : unsafeLegacy ? 'End the mood before changing mode; coordinated mode control is not installed.' : undefined,
      feedback: feedback[choice.mode],
      dismiss: () => setFeedback(current => {
        const next = { ...current };
        delete next[choice.mode];
        return next;
      }),
      activate: () => {
        if (disabled || active.current) return;
        const connection = useStore.getState().connection;
        if (!connection?.connected) return;
        active.current = true;
        setPending(true);
        const publish = (result: TargetResult) => {
          if (mounted.current) setFeedback(current => ({ ...current, [choice.mode]: result }));
        };
        publish({ target: choice.id, phase: 'pending' });
        let valid = true;
        let unsubscribe = () => {};
        const releaseListeners = () => {
          clearTimeout(timer);
          unsubscribe();
          connection.removeEventListener('disconnected', invalidate);
          connection.removeEventListener('ready', invalidate);
        };
        const invalidate = () => {
          if (!valid) return;
          publish({ target: choice.id, phase: 'unconfirmed', message: 'Connection changed or the request timed out. Check Home Assistant before reopening these controls.' });
          valid = false;
          releaseListeners();
          // An unknown outcome keeps both controls locked; a late ACK from the
          // previous socket epoch must never authorize a contradictory request.
        };
        const timer = setTimeout(invalidate, 35000);
        connection.addEventListener('disconnected', invalidate);
        connection.addEventListener('ready', invalidate);
        unsubscribe = useStore.subscribe(() => {
          const current = useStore.getState();
          if (current.connection !== connection || !connection.connected || current.connectionStatus !== 'connected') invalidate();
        });
        dispose.current = () => { valid = false; releaseListeners(); };
        void connection.sendMessagePromise<{ response?: { success?: boolean; mode_result?: string; errors?: { message?: string }[] } }>({
          type: 'call_service',
          domain: coordinated ? 'house_moods' : 'input_boolean',
          service: coordinated ? 'apply_mode' : 'turn_on',
          ...(coordinated
            ? { return_response: true, service_data: { mode: choice.mode } }
            : { target: { entity_id: [choice.id] } }),
        }).then(result => {
          if (!valid || !mounted.current) return;
          if (coordinated && result.response?.success === false) {
            publish({ target: choice.id, phase: 'failed', message: result.response.errors?.map(error => error.message).filter(Boolean).join(' ') || 'Mode change was rejected.' });
          } else if (coordinated && (result.response?.success !== true || result.response.mode_result !== 'accepted')) {
            publish({ target: choice.id, phase: 'unconfirmed', message: 'The mode routine did not return confirmation.' });
          } else {
            // Even a coordinated response only confirms service acceptance of DP22.
            // Helper states alone never prove that physical staging completed.
            publish({ target: choice.id, phase: 'accepted', message: 'Requested. Physical brightness is not confirmed.' });
          }
        }).catch(error => {
          if (!valid || !mounted.current) return;
          if (!connection.connected || (error && typeof error === 'object' && 'code' in error && error.code === ERR_CONNECTION_LOST)) {
            invalidate();
            return;
          }
          publish({ target: choice.id, phase: 'failed', message: error instanceof Error ? error.message : 'Mode request failed.' });
        }).finally(() => {
          releaseListeners();
          if (valid && mounted.current) {
            active.current = false;
            setPending(false);
          }
        });
      },
    };
  });
}

export function hasVisibleModeFeedback(mode: ReturnType<typeof useCanvasModes>[number]): boolean {
  const phase = mode.feedback?.phase;
  return Boolean(phase && phase !== 'observed' && phase !== 'accepted');
}

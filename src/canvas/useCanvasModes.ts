import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { ERR_CONNECTION_LOST } from 'home-assistant-js-websocket';
import type { HassEntity } from 'home-assistant-js-websocket';
import type { TargetResult } from './commands';

const choices = [
  { label: 'Day', mode: 'day', id: 'input_boolean.morning_mode' },
  { label: 'Night', mode: 'night', id: 'input_boolean.night_mode' },
] as const;
type Mode = (typeof choices)[number]['mode'];
type UncertainMode = { mode: Mode; coordinated: boolean; restoration?: { sessionId?: string } };
const moodEntityId = 'sensor.house_mood';

function restorationReported(sensor: HassEntity | undefined, uncertain: UncertainMode) {
  return Boolean(uncertain.restoration && sensor?.state === 'recovery_required' &&
    sensor.attributes.pending_mode === uncertain.mode &&
    (!uncertain.restoration.sessionId || sensor.attributes.session_id === uncertain.restoration.sessionId));
}

export function useCanvasModes() {
  const entities = useStore(store => store.entities);
  const connected = useStore(store => Boolean(store.connection?.connected && store.connectionStatus === 'connected'));
  const mood = entities[moodEntityId];
  const coordinated = mood?.attributes.mode_control === 'coordinated-v1';
  const phase = mood?.state;
  const busy = phase === 'starting' || phase === 'restoring' || phase === 'recovery_required';
  const unsafeLegacy = !coordinated && phase !== undefined && phase !== 'idle';
  const validHelpers = choices.every(choice => ['on', 'off'].includes(entities[choice.id]?.state));
  const [feedback, setFeedback] = useState<Record<string, TargetResult>>({});
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState<UncertainMode | null>(null);
  const currentUncertainty = useRef<UncertainMode | null>(null);
  const [checking, setChecking] = useState(false);
  const active = useRef(false);
  const checkActive = useRef(false);
  const mounted = useRef(true);
  const dispose = useRef<() => void>(() => {});
  const disposeCheck = useRef<() => void>(() => {});
  if (uncertain && restorationReported(mood, uncertain)) {
    // The shared House Mood notice now owns recovery for the journal.
    setUncertain(null);
    setFeedback(current => {
      const next = { ...current };
      delete next[uncertain.mode];
      return next;
    });
  }
  useLayoutEffect(() => {
    currentUncertainty.current = uncertain;
    return () => {
      currentUncertainty.current = null;
      if (checkActive.current) disposeCheck.current();
    };
  }, [uncertain]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      checkActive.current = false;
      dispose.current();
      disposeCheck.current();
    };
  }, []);
  const checkStatus = async (mode: Mode, target: string) => {
    if (uncertain?.mode !== mode || checkActive.current) return;
    const isCurrent = () => mounted.current && currentUncertainty.current === uncertain;
    if (!isCurrent()) return;
    const before = useStore.getState();
    const connection = before.connection;
    if (!connection?.connected || before.connectionStatus !== 'connected') return;
    checkActive.current = true;
    setChecking(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connectionChanged = false;
    const changed = () => { connectionChanged = true; };
    connection.addEventListener('disconnected', changed);
    connection.addEventListener('ready', changed);
    let cancel!: (error: Error) => void;
    const cancelled = new Promise<never>((_, reject) => { cancel = reject; });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      connection.removeEventListener('disconnected', changed);
      connection.removeEventListener('ready', changed);
    };
    const disposeCurrentCheck = () => {
      release();
      cancel(new Error('Status check cancelled.'));
    };
    disposeCheck.current = disposeCurrentCheck;
    try {
      const states = await Promise.race([
        connection.sendMessagePromise<unknown>({ type: 'get_states' }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Status check timed out. Please try again.')), 15000); }),
        cancelled,
      ]);
      if (!isCurrent()) return;
      if (connectionChanged || useStore.getState().connection !== connection || !connection.connected || useStore.getState().connectionStatus !== 'connected')
        throw new Error('Connection changed during the status check. Please try again.');
      if (!Array.isArray(states)) throw new Error('Home Assistant returned an invalid status. Please try again.');
      const fresh = new Map<string, HassEntity>();
      for (const item of states) {
        if (item && typeof item === 'object' && typeof item.entity_id === 'string' && typeof item.state === 'string' && item.attributes && typeof item.attributes === 'object')
          fresh.set(item.entity_id, item as HassEntity);
      }
      const morning = fresh.get('input_boolean.morning_mode');
      const night = fresh.get('input_boolean.night_mode');
      const store = useStore.getState();
      const received = store.entities[moodEntityId];
      const sensor = received && received !== before.entities[moodEntityId] ? received : fresh.get(moodEntityId);
      if (!morning || !night || !['on', 'off'].includes(morning.state) || !['on', 'off'].includes(night.state))
        throw new Error('Mode helpers are unavailable. Check Home Assistant and try again.');
      if ((uncertain.coordinated || coordinated) && sensor?.attributes.mode_control !== 'coordinated-v1' && !restorationReported(sensor, uncertain))
        throw new Error('Coordinated mode status is unavailable. Please try again.');
      if (mood && !sensor) throw new Error('Mood status is unavailable. Please try again.');
      if (sensor && !['idle', 'active', 'recovery_required'].includes(sensor.state))
        throw new Error('The mood operation is still in progress. Check status again shortly.');
      // These values came from a new get_states response, not cached helper telemetry.
      // Updating the store makes the next control decision use this same snapshot.
      useStore.setState({ entities: { ...store.entities, ...Object.fromEntries([morning, night, sensor].filter((item): item is HassEntity => Boolean(item)).map(item => [item.entity_id, item])) } });
      if (!isCurrent()) return;
      active.current = false;
      setPending(false);
      setUncertain(null);
      setFeedback(current => ({ ...current, [mode]: { target, phase: 'observed' } }));
    } catch (error) {
      if (isCurrent()) setFeedback(current => ({ ...current, [mode]: { target, phase: 'unconfirmed', message: error instanceof Error ? error.message : 'Status check failed. Please try again.' } }));
    } finally {
      release();
      if (disposeCheck.current === disposeCurrentCheck) disposeCheck.current = () => {};
      checkActive.current = false;
      if (mounted.current) setChecking(false);
    }
  };
  return choices.map(choice => {
    const state = entities[choice.id]?.state;
    const disabled = !connected || !validHelpers || pending || checking || Boolean(uncertain) || busy || unsafeLegacy || (!coordinated && state === 'on');
    return {
      label: choice.label,
      mode: choice.mode,
      state,
      disabled,
      disabledReason: busy ? 'Finish the current mood operation or recovery before changing mode.' : unsafeLegacy ? 'End the mood before changing mode; coordinated mode control is not installed.' : undefined,
      feedback: feedback[choice.mode],
      recoveryRequired: uncertain?.mode === choice.mode,
      restorationPending: uncertain?.mode === choice.mode && Boolean(uncertain.restoration),
      checking,
      checkDisabled: !connected || checking,
      checkStatus: () => { void checkStatus(choice.mode, choice.id); },
      dismiss: () => setFeedback(current => {
        const next = { ...current };
        delete next[choice.mode];
        return next;
      }),
      activate: () => {
        if (disabled || active.current || checkActive.current) return;
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
          if (mounted.current) setUncertain({ mode: choice.mode, coordinated });
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
        void connection.sendMessagePromise<{
          response?: { success?: boolean; phase?: string; pending_mode?: string; session_id?: string | null; mode_result?: string; errors?: { message?: string }[] };
        }>({
          type: 'call_service',
          domain: coordinated ? 'house_moods' : 'input_boolean',
          service: coordinated ? 'apply_mode' : 'turn_on',
          ...(coordinated
            ? { return_response: true, service_data: { mode: choice.mode } }
            : { target: { entity_id: [choice.id] } }),
        }).then(result => {
          if (!valid || !mounted.current) return;
          if (coordinated && result.response?.success === false) {
            const message = result.response.errors?.map(error => error.message).filter(Boolean).join(' ');
            if (result.response.phase === 'recovery_required' && result.response.pending_mode === choice.mode) {
              const outcome = { mode: choice.mode, coordinated, restoration: { sessionId: result.response.session_id ?? undefined } };
              if (restorationReported(useStore.getState().entities[moodEntityId], outcome)) {
                publish({ target: choice.id, phase: 'observed' });
              } else {
                publish({ target: choice.id, phase: 'unconfirmed', message: message || 'Home Assistant reports that restoration is needed.' });
                setUncertain(outcome);
              }
            } else {
              publish({ target: choice.id, phase: 'failed', message: message || 'Mode change was rejected.' });
            }
          } else if (coordinated && (result.response?.success !== true || result.response.mode_result !== 'accepted')) {
            publish({ target: choice.id, phase: 'unconfirmed', message: 'The mode routine did not return confirmation.' });
            setUncertain({ mode: choice.mode, coordinated });
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
  return mode.recoveryRequired || Boolean(phase && phase !== 'observed' && phase !== 'accepted');
}

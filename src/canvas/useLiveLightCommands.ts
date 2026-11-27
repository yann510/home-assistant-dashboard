import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@hakit/core';
import { executeCommand, type CommandResult, type DeviceIntent, type TargetResult } from './commands';

const INTERVAL = 150;
type LightIntent = { intent: DeviceIntent; observe?: (id: string) => boolean; onlyOn: boolean };
type Request = LightIntent & {
  resolve: (result: CommandResult | null) => void;
  connection: unknown;
  epoch: number;
};
export type LightCommandOutcome = TargetResult & { retryRequiresOn?: boolean };
type Lane = {
  queued: Map<string, Request>;
  timer?: ReturnType<typeof setTimeout>;
  awaitingAck: boolean;
  lastSent: number;
  observations: Map<string, AbortController>;
  ackController?: AbortController;
  latestController?: AbortController;
  failed?: LightIntent;
};

/** Coalesce input per light, serialize service acknowledgements, and supersede obsolete telemetry waits. */
export function useLiveLightCommands(publish: (results: LightCommandOutcome[]) => void) {
  const lanes = useRef(new Map<string, Lane>());
  const mounted = useRef(true);
  const epoch = useRef(0);
  const publishRef = useRef(publish);
  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);
  useEffect(() => {
    mounted.current = true;
    const current = lanes.current;
    let connection = useStore.getState().connection;
    const invalidate = () => {
      epoch.current++;
      current.forEach(lane => {
        clearTimeout(lane.timer);
        lane.queued.forEach(request => request.resolve(null));
        lane.queued.clear();
      });
    };
    const detach = () => {
      connection?.removeEventListener('disconnected', invalidate);
      connection?.removeEventListener('ready', invalidate);
    };
    const attach = () => {
      connection?.addEventListener('disconnected', invalidate);
      connection?.addEventListener('ready', invalidate);
    };
    attach();
    const unsubscribe = useStore.subscribe(() => {
      const state = useStore.getState();
      if (state.connection !== connection) {
        detach();
        invalidate();
        connection = state.connection;
        attach();
      } else if (!connection?.connected || state.connectionStatus !== 'connected') invalidate();
    });
    return () => {
      detach();
      unsubscribe();
      mounted.current = false;
      current.forEach(lane => {
        clearTimeout(lane.timer);
        lane.queued.forEach(request => request.resolve(null));
        lane.observations.forEach(controller => controller.abort());
      });
      current.clear();
    };
  }, []);
  const send = useCallback((intent: DeviceIntent, observe?: (id: string) => boolean, onlyOn = false): Promise<CommandResult | null> => {
    const connection = useStore.getState().connection;
    const requests = intent.targets.map(
      id =>
        new Promise<CommandResult | null>(resolve => {
          let lane = lanes.current.get(id);
          if (!lane) {
            lane = { queued: new Map(), awaitingAck: false, lastSent: 0, observations: new Map() };
            lanes.current.set(id, lane);
          }
          const targetLane = lane;
          const key = Object.keys(intent.data ?? {})
            .sort()
            .join(',');
          targetLane.queued.get(key)?.resolve(null);
          targetLane.queued.set(key, { intent: { ...intent, targets: [id] }, observe, resolve, connection, epoch: epoch.current, onlyOn });
          const drain = () => {
            if (!mounted.current || targetLane.awaitingAck || !targetLane.queued.size) return;
            const queuedKey = targetLane.queued.keys().next().value;
            const delay = queuedKey ? Math.max(0, INTERVAL - (Date.now() - targetLane.lastSent)) : 0;
            if (delay) {
              clearTimeout(targetLane.timer);
              targetLane.timer = setTimeout(drain, delay);
              return;
            }
            const [nextKey, request] = targetLane.queued.entries().next().value!;
            targetLane.queued.delete(nextKey);
            const state = useStore.getState();
            const entity = state.entities[id];
            // A queued gesture must never replay on another connection or turn off room lights back on.
            if (
              epoch.current !== request.epoch ||
              state.connection !== request.connection ||
              !state.connection?.connected ||
              state.connectionStatus !== 'connected' ||
              !entity ||
              !['on', 'off'].includes(entity.state) ||
              (request.onlyOn && entity.state !== 'on')
            ) {
              request.resolve(null);
              drain();
              return;
            }
            if (!nextKey) targetLane.observations.forEach(controller => controller.abort());
            else targetLane.observations.get(nextKey)?.abort();
            const controller = new AbortController();
            targetLane.observations.set(nextKey, controller);
            targetLane.ackController = controller;
            targetLane.latestController = controller;
            targetLane.awaitingAck = true;
            targetLane.lastSent = Date.now();
            targetLane.failed = undefined;
            const release = () => {
              if (targetLane.ackController !== controller) return;
              targetLane.awaitingAck = false;
              drain();
            };
            const publishCurrent = (result: CommandResult) => {
              if (!mounted.current || targetLane.latestController !== controller || controller.signal.aborted) return;
              const item = result.results[0];
              if (item.phase === 'failed' || item.phase === 'unconfirmed') {
                targetLane.failed = { intent: request.intent, observe: request.observe, onlyOn: request.onlyOn };
                publishRef.current([{ ...item, retryRequiresOn: request.onlyOn }]);
              } else {
                publishRef.current(result.results);
              }
            };
            publishCurrent({ results: [{ target: id, phase: 'pending' }] });
            void executeCommand(request.intent, useStore, request.observe, controller.signal, publishCurrent, release)
              .then(result => request.resolve(controller.signal.aborted ? null : result))
              .finally(() => {
                if (targetLane.observations.get(nextKey) === controller) targetLane.observations.delete(nextKey);
                release();
              });
          };
          drain();
        })
    );
    return Promise.all(requests).then(results => {
      const completed = results.filter((result): result is CommandResult => result !== null);
      return completed.length ? { results: completed.flatMap(result => result.results) } : null;
    });
  }, []);
  const cancelQueued = useCallback((ids: readonly string[]) => {
    ids.forEach(id => {
      const lane = lanes.current.get(id);
      if (!lane) return;
      clearTimeout(lane.timer);
      lane.queued.forEach(request => request.resolve(null));
      lane.queued.clear();
      lane.observations.forEach(controller => {
        // Do not release the serialization gate before the actual service acknowledgement.
        if (!lane.awaitingAck || controller !== lane.ackController) controller.abort();
      });
    });
  }, []);
  const retry = useCallback((id: string) => {
    const lane = lanes.current.get(id);
    const failed = lane?.failed;
    const state = useStore.getState();
    const deviceState = state.entities[id]?.state;
    if (!lane || !failed || lane.awaitingAck || lane.queued.size || !state.connection?.connected ||
        state.connectionStatus !== 'connected' || (deviceState !== 'on' && (deviceState !== 'off' || failed.onlyOn))) return;

    // A timed-out command may already have taken effect. Avoid sending it again.
    try {
      if (failed.observe?.(id)) {
        lane.failed = undefined;
        publishRef.current([{ target: id, phase: 'observed' }]);
        return;
      }
    } catch {
      // If telemetry is malformed, the command will report that it could not verify the state.
    }
    void send(failed.intent, failed.observe, failed.onlyOn);
  }, [send]);
  return { send, cancelQueued, retry };
}

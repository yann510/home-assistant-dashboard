import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@hakit/core';
import { executeCommand, type CommandResult, type DeviceIntent, type TargetResult } from './commands';

const DEBOUNCE = 250;
const CONTINUOUS_PROPERTIES = new Set(['brightness', 'rgb_color', 'color_temp', 'color_temp_kelvin']);
type Request = {
  intent: DeviceIntent;
  observe?: (id: string) => boolean;
  resolve: (result: CommandResult | null) => void;
  connection: unknown;
  epoch: number;
  onlyOn: boolean;
  readyAt: number;
};
type Lane = {
  queued: Map<string, Request>;
  timer?: ReturnType<typeof setTimeout>;
  awaitingAck: boolean;
  observations: Map<string, AbortController>;
  ackController?: AbortController;
  latestController?: AbortController;
};

/** Debounce continuous input per light/property, serialize service acknowledgements, and supersede obsolete telemetry waits. */
export function useLiveLightCommands(publish: (results: TargetResult[]) => void) {
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
            lane = { queued: new Map(), awaitingAck: false, observations: new Map() };
            lanes.current.set(id, lane);
          }
          const targetLane = lane;
          const key = Object.keys(intent.data ?? {})
            .sort()
            .join(',');
          targetLane.queued.get(key)?.resolve(null);
          targetLane.queued.set(key, {
            intent: { ...intent, targets: [id] },
            observe,
            resolve,
            connection,
            epoch: epoch.current,
            onlyOn,
            readyAt: Date.now() + (Object.keys(intent.data ?? {}).some(property => CONTINUOUS_PROPERTIES.has(property)) ? DEBOUNCE : 0),
          });
          const drain = () => {
            clearTimeout(targetLane.timer);
            if (!mounted.current || targetLane.awaitingAck || !targetLane.queued.size) return;
            // Each property owns its quiet-period deadline; later colour movement must not delay brightness.
            const [nextKey, request] = [...targetLane.queued.entries()].reduce((earliest, entry) =>
              entry[1].readyAt < earliest[1].readyAt ? entry : earliest
            );
            const delay = Math.max(0, request.readyAt - Date.now());
            if (delay) {
              targetLane.timer = setTimeout(drain, delay);
              return;
            }
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
            const release = () => {
              if (targetLane.ackController !== controller) return;
              targetLane.awaitingAck = false;
              drain();
            };
            const publishCurrent = (result: CommandResult) => {
              if (mounted.current && targetLane.latestController === controller && !controller.signal.aborted)
                publishRef.current(result.results);
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
  return { send, cancelQueued };
}

import { createContext, createElement, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore, type LightEntity } from '@hakit/core';
import { rooms as inventory } from '../useLightSummary';
import { lightLabel } from './lightLabels';
import { useLiveLightCommands } from './useLiveLightCommands';
import type { CommandResult, TargetResult } from './commands';

export type CanvasLight = { id: string; name: string; label: string; state: 'on' | 'off' | 'unavailable'; entity?: LightEntity };
export type CanvasRoom = {
  name: string;
  lights: CanvasLight[];
  on: number;
  available: number;
  brightness?: number;
  brightnessMixed: boolean;
};
const readableName = (id: string, entity?: LightEntity) =>
  entity?.attributes.friendly_name ||
  id
    .split('.')[1]
    .replace(/^light_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase());
const usable = (entity?: LightEntity) => entity?.state === 'on' || entity?.state === 'off';
const current = (id: string) => useStore.getState().entities[id] as LightEntity | undefined;
const supportsBrightness = (entity?: LightEntity) =>
  Boolean(entity?.attributes.supported_color_modes?.some(mode => !['onoff', 'unknown'].includes(mode)));

function useCanvasLightsController() {
  const entities = useStore(state => state.entities);
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const busyRef = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Record<string, TargetResult>>({});
  const { send: sendLive, cancelQueued } = useLiveLightCommands(results =>
    setOutcomes(previous => ({ ...previous, ...Object.fromEntries(results.map(item => [item.target, item])) }))
  );
  const [selectedRoom, setSelectedRoom] = useState<string>(inventory[0].name);
  const rooms: CanvasRoom[] = useMemo(
    () =>
      inventory.map(room => {
        const lights = room.lights.map(id => {
          const entity = entities[id] as LightEntity | undefined;
          return {
            id,
            name: readableName(id, entity),
            label: lightLabel(id, readableName(id, entity), room.name),
            state: usable(entity) ? (entity!.state as 'on' | 'off') : ('unavailable' as const),
            entity,
          };
        });
        const dimmableOn = lights.filter(light => light.state === 'on' && supportsBrightness(light.entity));
        const knownLevels = dimmableOn
          .map(light => light.entity?.attributes.brightness)
          .filter((level): level is number => typeof level === 'number' && Number.isFinite(level));
        const levels = knownLevels.map(level => Math.round((level / 255) * 100));
        return {
          name: room.name,
          lights,
          on: lights.filter(light => light.state === 'on').length,
          available: lights.filter(light => light.state !== 'unavailable').length,
          brightnessMixed: new Set(knownLevels).size > 1,
          brightness:
            levels.length && levels.length === dimmableOn.length
              ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length)
              : undefined,
        };
      }),
    [entities]
  );

  const power = useCallback(
    async (ids: readonly string[], desired: 'on' | 'off') => {
      const targets = ids.filter(id => usable(current(id)) && current(id)?.state !== desired && !busyRef.current.has(id));
      if (!targets.length) return null;
      cancelQueued(targets);
      targets.forEach(id => busyRef.current.add(id));
      setBusy(new Set(busyRef.current));
      try {
        return await sendLive(
          { domain: 'light', service: desired === 'on' ? 'turn_on' : 'turn_off', targets },
          id => useStore.getState().entities[id]?.state === desired
        );
      } finally {
        targets.forEach(id => busyRef.current.delete(id));
        setBusy(new Set(busyRef.current));
      }
    },
    [sendLive, cancelQueued]
  );
  const brightness = useCallback(
    (ids: readonly string[], percent: number) => {
      const targets = ids.filter(id => current(id)?.state === 'on' && supportsBrightness(current(id)));
      const value = Math.round((Math.max(1, Math.min(100, percent)) * 255) / 100);
      return sendLive(
        { domain: 'light', service: 'turn_on', targets, data: { brightness: value } },
        id => {
          const next = useStore.getState().entities[id] as LightEntity | undefined;
          return next?.state === 'on' && Math.abs(Number(next.attributes.brightness) - value) <= 1;
        },
        true
      );
    },
    [sendLive]
  );
  const results = Object.values(outcomes);
  return {
    rooms,
    selectedRoom,
    setSelectedRoom,
    connected,
    busy,
    result: results.length ? ({ results } satisfies CommandResult) : null,
    sendLive,
    power,
    brightness,
  };
}
type Controller = ReturnType<typeof useCanvasLightsController>;
const LightsContext = createContext<Controller | null>(null);
export function CanvasLightsProvider({ children }: { children: ReactNode }) {
  const value = useCanvasLightsController();
  return createElement(LightsContext.Provider, { value }, children);
}
export function useCanvasLights() {
  const value = useContext(LightsContext);
  if (!value) throw new Error('CanvasLightsProvider is required.');
  return value;
}
export function lightSupportsBrightness(entity?: LightEntity) {
  return supportsBrightness(entity);
}

import { createContext, createElement, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore, type LightEntity } from '@hakit/core';
import { rooms as inventory } from '../useLightSummary';
import { useDeviceCommand } from './useDeviceCommand';
import type { CommandResult, DeviceIntent, TargetResult } from './commands';

export type CanvasLight = { id: string; name: string; state: 'on' | 'off' | 'unavailable'; entity?: LightEntity };
export type CanvasRoom = { name: string; lights: CanvasLight[]; on: number; available: number; brightness?: number };
const readableName = (id: string, entity?: LightEntity) =>
  entity?.attributes.friendly_name || id.split('.')[1].replace(/^light_/, '').replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
const usable = (entity?: LightEntity) => entity?.state === 'on' || entity?.state === 'off';
const current = (id: string) => useStore.getState().entities[id] as LightEntity | undefined;
const supportsBrightness = (entity?: LightEntity) => Boolean(entity?.attributes.supported_color_modes?.some(mode => !['onoff', 'unknown'].includes(mode)));

function useCanvasLightsController() {
  const entities = useStore(state => state.entities);
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const { send: sendCommand, pending, result: activeResult } = useDeviceCommand();
  const busyRef = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Record<string, TargetResult>>({});
  const [selectedRoom, setSelectedRoom] = useState<string>(inventory[0].name);
  const rooms: CanvasRoom[] = useMemo(() => inventory.map(room => {
    const lights = room.lights.map(id => {
      const entity = entities[id] as LightEntity | undefined;
      return { id, name: readableName(id, entity), state: usable(entity) ? entity!.state as 'on' | 'off' : 'unavailable' as const, entity };
    });
    const levels = lights.filter(light => light.state === 'on' && typeof light.entity?.attributes.brightness === 'number')
      .map(light => Math.round(light.entity!.attributes.brightness! / 255 * 100));
    return { name: room.name, lights, on: lights.filter(light => light.state === 'on').length,
      available: lights.filter(light => light.state !== 'unavailable').length,
      brightness: levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : undefined };
  }), [entities]);

  const send = useCallback(async (intent: DeviceIntent, observe?: (id: string) => boolean) => {
    const targets = intent.targets.filter(id => !busyRef.current.has(id));
    if (!targets.length) return null;
    targets.forEach(id => busyRef.current.add(id));
    setBusy(new Set(busyRef.current));
    setOutcomes(previous => ({ ...previous, ...Object.fromEntries(targets.map(target => [target, { target, phase: 'pending' as const }])) }));
    try {
      const outcome = await sendCommand({ ...intent, targets }, observe);
      setOutcomes(previous => ({ ...previous, ...Object.fromEntries(outcome.results.map(item => [item.target, item])) }));
      return outcome;
    } finally {
      targets.forEach(id => busyRef.current.delete(id));
      setBusy(new Set(busyRef.current));
    }
  }, [sendCommand]);
  const power = useCallback((ids: readonly string[], desired: 'on' | 'off') => {
    const targets = ids.filter(id => usable(current(id)) && current(id)?.state !== desired);
    if (!targets.length) return Promise.resolve(null);
    return send({ domain: 'light', service: desired === 'on' ? 'turn_on' : 'turn_off', targets },
      id => useStore.getState().entities[id]?.state === desired);
  }, [send]);
  const brightness = useCallback((ids: readonly string[], percent: number) => {
    const targets = ids.filter(id => usable(current(id)) && supportsBrightness(current(id)));
    const value = Math.round(Math.max(1, Math.min(100, percent)) * 255 / 100);
    return send({ domain: 'light', service: 'turn_on', targets, data: { brightness: value } },
      id => {
        const next = useStore.getState().entities[id] as LightEntity | undefined;
        return next?.state === 'on' && Math.abs(Number(next.attributes.brightness) - value) <= 1;
      });
  }, [send]);
  const visibleResults = { ...outcomes };
  for (const item of activeResult?.results ?? []) {
    if (busy.has(item.target)) visibleResults[item.target] = item;
  }
  const results = Object.values(visibleResults);
  return { rooms, selectedRoom, setSelectedRoom, connected, busy, pending,
    result: results.length ? { results } satisfies CommandResult : null, send, power, brightness };
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
export function lightSupportsBrightness(entity?: LightEntity) { return supportsBrightness(entity); }

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useStore } from '@hakit/core';
import { useDeviceCommand } from './useDeviceCommand';

// Home Assistant VacuumEntityFeature values.
const feature = { pause: 4, stop: 8, returnHome: 16, fanSpeed: 32, locate: 512, start: 8192 } as const;
const entityId = 'vacuum.roomba';
const activeStates = ['cleaning', 'on', 'auto', 'spot', 'edge', 'single_room', 'mowing', 'edgecut'];
const label = (state: string) => state.replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());

function useCanvasVacuumController() {
  const entity = useStore(state => state.entities[entityId]);
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const { send, pending, result } = useDeviceCommand();
  const busy = useRef(false);
  const [draftFan, setDraftFan] = useState<string | null>(null);
  const available = connected && entity && !['unknown', 'unavailable'].includes(entity.state);

  async function command(service: string, data?: Record<string, unknown>, observe?: (state: string) => boolean) {
    if (!available || busy.current) return;
    busy.current = true;
    try {
      const outcome = await send(
        { domain: 'vacuum', service, targets: [entityId], data },
        observe ? id => observe(useStore.getState().entities[id]?.state ?? '') : undefined
      );
      if (service === 'set_fan_speed' && outcome.results[0]?.phase === 'observed') setDraftFan(null);
    } finally {
      busy.current = false;
    }
  }

  return { entity, connected, available, pending, result, draftFan, setDraftFan, command };
}

type Controller = ReturnType<typeof useCanvasVacuumController>;
const VacuumContext = createContext<Controller | null>(null);

export function CanvasVacuumProvider({ children }: { children: ReactNode }) {
  const controller = useCanvasVacuumController();
  return <VacuumContext.Provider value={controller}>{children}</VacuumContext.Provider>;
}

export function CanvasVacuum() {
  const controller = useContext(VacuumContext);
  if (!controller) throw new Error('CanvasVacuumProvider is required.');
  const { entity, connected, available, pending, result, draftFan, setDraftFan, command } = controller;
  const state = entity?.state ?? 'unavailable';
  const attrs = entity?.attributes;
  const supported = typeof attrs?.supported_features === 'number' ? attrs.supported_features : 0;
  const can = (flag: number) => Boolean(available && supported & flag);
  const fanList = Array.isArray(attrs?.fan_speed_list)
    ? attrs.fan_speed_list.filter((item): item is string => typeof item === 'string')
    : [];
  const reportedFan = typeof attrs?.fan_speed === 'string' ? attrs.fan_speed : null;
  const fanValue = draftFan ?? reportedFan ?? '';
  const actions: { name: string; service: string; flag: number; show: boolean; observe?: (state: string) => boolean }[] = [
    {
      name: 'Start cleaning',
      service: 'start',
      flag: feature.start,
      show: ['docked', 'idle', 'paused', 'returning'].includes(state),
      observe: next => activeStates.includes(next),
    },
    {
      name: 'Pause cleaning',
      service: 'pause',
      flag: feature.pause,
      show: activeStates.includes(state),
      observe: next => next === 'paused',
    },
    {
      name: 'Stop cleaning',
      service: 'stop',
      flag: feature.stop,
      show: activeStates.includes(state) || state === 'paused' || state === 'returning',
      observe: next => next === 'idle' || next === 'docked',
    },
    {
      name: 'Return to dock',
      service: 'return_to_base',
      flag: feature.returnHome,
      show: activeStates.includes(state) || ['paused', 'idle'].includes(state),
      observe: next => next === 'returning' || next === 'docked',
    },
    { name: 'Locate Roomba', service: 'locate', flag: feature.locate, show: true },
  ];

  const feedback = result?.results[0];
  return (
    <section className='canvas-vacuum' aria-label='Roomba controls'>
      <div className='canvas-vacuum__summary'>
        <strong>Roomba</strong>
        <span role='status'>
          {!connected ? 'Disconnected' : !entity || ['unknown', 'unavailable'].includes(state) ? 'Unavailable' : label(state)}
        </span>
        {typeof attrs?.battery_level === 'number' && <span>Battery {attrs.battery_level}%</span>}
      </div>
      {!available && <p role='status'>Reconnect or wait for a reliable Roomba state to use controls.</p>}
      <div className='canvas-vacuum__actions'>
        {actions
          .filter(action => action.show && can(action.flag))
          .map(action => (
            <button
              key={action.service}
              type='button'
              disabled={!available || pending}
              onClick={() => void command(action.service, undefined, action.observe)}
            >
              {action.name}
            </button>
          ))}
      </div>
      {can(feature.fanSpeed) && fanList.length > 0 && state !== 'docked' && (
        <div className='canvas-vacuum__fan'>
          <label>
            Roomba fan speed{' '}
            <select aria-label='Roomba fan speed' value={fanValue} disabled={pending} onChange={event => setDraftFan(event.target.value)}>
              {!fanValue && <option value=''>Choose speed</option>}
              {fanList.map(speed => (
                <option key={speed} value={speed}>
                  {speed}
                </option>
              ))}
            </select>
          </label>
          <button
            type='button'
            disabled={pending || !draftFan || draftFan === reportedFan}
            onClick={() =>
              void command(
                'set_fan_speed',
                { fan_speed: draftFan },
                () => useStore.getState().entities[entityId]?.attributes.fan_speed === draftFan
              )
            }
          >
            Set fan speed
          </button>
        </div>
      )}
      {pending && <p role='status'>Sending command…</p>}
      {feedback?.phase === 'accepted' && <p role='status'>Service accepted; device response is not yet verified.</p>}
      {feedback?.phase === 'observed' && <p role='status'>Roomba reported the requested state.</p>}
      {(feedback?.phase === 'failed' || feedback?.phase === 'unconfirmed') && <p role='alert'>{feedback.message}</p>}
    </section>
  );
}

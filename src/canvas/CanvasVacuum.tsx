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
    <section className='canvas-vacuum' aria-label='Roomba controls' data-active={Boolean(available && activeStates.includes(state))}>
      <div className='canvas-vacuum__summary'>
        <svg className='canvas-vacuum__artwork' viewBox='0 0 160 120' fill='none' aria-hidden='true'>
          <ellipse cx='80' cy='104' rx='52' ry='7' fill='currentColor' opacity='.08' />
          <path d='M24 93c-17-30 3-66 30-71 29-6 32 13 55 8 28-5 38 36 16 61' fill='currentColor' opacity='.08' />
          <g stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M53 23v-8h54v8' opacity='.45' />
            <circle cx='80' cy='65' r='37' fill='var(--canvas-surface, #2e2c33)' />
            <circle cx='80' cy='65' r='31' opacity='.25' />
            <path d='M48 81h64M68 36h24M48 90l-9 9M112 90l9 9' />
            <circle cx='80' cy='59' r='9' fill='currentColor' fillOpacity='.16' />
            <path d='M80 53v6m-4-4a6 6 0 1 0 8 0' strokeWidth='1.4' />
            <g className='canvas-vacuum__sparkles'>
              <path d='M131 32v12m-6-6h12M28 49v8m-4-4h8' />
            </g>
          </g>
        </svg>
        <div className='canvas-vacuum__readout'>
          <span className='canvas-vacuum__state' role='status'>
            {!connected ? 'Disconnected' : !entity || ['unknown', 'unavailable'].includes(state) ? 'Unavailable' : label(state)}
          </span>
          {available && typeof attrs?.battery_level === 'number' && Number.isFinite(attrs.battery_level) && (
            <span className='canvas-vacuum__battery'>
              <svg viewBox='0 0 24 14' fill='none' aria-hidden='true'>
                <rect x='1' y='1' width='19' height='12' rx='3' stroke='currentColor' />
                <path d='M23 5v4' stroke='currentColor' strokeWidth='2' />
                <rect
                  x='4'
                  y='4'
                  width={(13 * Math.max(0, Math.min(100, attrs.battery_level))) / 100}
                  height='6'
                  rx='1'
                  fill='currentColor'
                />
              </svg>
              Battery {attrs.battery_level}%
            </span>
          )}
        </div>
      </div>
      {!available && <p role='status'>Reconnect or wait for a reliable Roomba state to use controls.</p>}
      <div className='canvas-vacuum__actions'>
        {actions
          .filter(action => action.show && can(action.flag))
          .map(action => (
            <button
              key={action.service}
              className={`canvas-vacuum__action${['start', 'pause'].includes(action.service) ? ' canvas-vacuum__action--primary' : ''}`}
              type='button'
              disabled={!available || pending}
              onClick={() => void command(action.service, undefined, action.observe)}
            >
              <svg
                viewBox='0 0 24 24'
                aria-hidden='true'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                strokeLinecap='round'
                strokeLinejoin='round'
              >
                {action.service === 'start' && <path d='m9 5 10 7-10 7V5Z' fill='currentColor' stroke='none' />}
                {action.service === 'pause' && <path d='M8 5v14M16 5v14' strokeWidth='3' />}
                {action.service === 'stop' && <rect x='6' y='6' width='12' height='12' rx='2' />}
                {action.service === 'return_to_base' && <path d='m3 11 9-8 9 8M6 10v11h12V10M10 21v-7h4v7' />}
                {action.service === 'locate' && (
                  <>
                    <circle cx='12' cy='12' r='7' />
                    <circle cx='12' cy='12' r='2' />
                    <path d='M12 2v3m0 14v3M2 12h3m14 0h3' />
                  </>
                )}
              </svg>
              {action.name}
            </button>
          ))}
      </div>
      {can(feature.fanSpeed) && fanList.length > 0 && state !== 'docked' && (
        <div className='canvas-vacuum__fan'>
          <label>
            <span>Fan speed</span>
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

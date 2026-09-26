import { createContext, useContext, useRef, type CSSProperties, type ReactNode } from 'react';
import { useStore } from '@hakit/core';
import { RoomArtwork } from './RoomArtwork';
import { getRoomAccent } from './room-artwork';
import './canvas-thermostats.css';
import { useDeviceCommand } from './useDeviceCommand';

const rooms = [
  { id: 'climate.thermostat_office', name: 'Office' },
  { id: 'climate.thermostat_gym', name: 'Gym' },
  { id: 'climate.thermostat_bedroom', name: 'Bedroom' },
] as const;
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const format = (value: number) => String(Number(value.toFixed(1)));

function useThermostat(room: (typeof rooms)[number]) {
  const entity = useStore(store => store.entities[room.id]);
  const connected = useStore(store => Boolean(store.connection?.connected && store.connectionStatus === 'connected'));
  const { send, pending, result } = useDeviceCommand();
  const busy = useRef(false);
  const attrs = entity?.attributes;
  const target = attrs?.temperature;
  const current = attrs?.current_temperature;
  const min = attrs?.min_temp;
  const max = attrs?.max_temp;
  const step = numeric(attrs?.target_temp_step) && attrs.target_temp_step > 0 ? attrs.target_temp_step : 0.5;
  const unavailable = !connected || !entity || ['unknown', 'unavailable'].includes(entity.state);
  const state = unavailable
    ? 'Unavailable'
    : entity.state === 'off'
      ? 'Off'
      : attrs?.hvac_action === 'heating'
        ? 'Heating'
        : attrs?.hvac_action === 'idle'
          ? 'Idle'
          : 'Unknown';
  const disabled =
    unavailable ||
    state === 'Off' ||
    pending ||
    !numeric(target) ||
    !numeric(min) ||
    !numeric(max) ||
    !((attrs?.supported_features ?? 0) & 1);
  const next = (direction: number) =>
    numeric(target) && numeric(min) && numeric(max) ? Number(Math.max(min, Math.min(max, target + direction * step)).toFixed(2)) : null;
  async function change(direction: number) {
    if (disabled || busy.current) return;
    const temperature = next(direction);
    if (temperature === null || temperature === target) return;
    busy.current = true;
    try {
      await send({ domain: 'climate', service: 'set_temperature', targets: [room.id], data: { temperature } }, id => {
        const reported = useStore.getState().entities[id];
        return Boolean(
          reported &&
          !['unknown', 'unavailable'].includes(reported.state) &&
          numeric(reported.attributes.temperature) &&
          Math.abs(reported.attributes.temperature - temperature) < 0.01
        );
      });
    } finally {
      busy.current = false;
    }
  }
  return { room, target, current, unavailable, state, disabled, next, change, pending, feedback: result?.results[0] };
}
type Controller = ReturnType<typeof useThermostat>;
const ThermostatsContext = createContext<Controller[] | null>(null);
export function CanvasThermostatsProvider({ children }: { children: ReactNode }) {
  // One controller per physical target, mounted for the dashboard lifetime.
  const office = useThermostat(rooms[0]);
  const gym = useThermostat(rooms[1]);
  const bedroom = useThermostat(rooms[2]);
  return <ThermostatsContext.Provider value={[office, gym, bedroom]}>{children}</ThermostatsContext.Provider>;
}
export function CanvasThermostats() {
  const controllers = useContext(ThermostatsContext);
  if (!controllers) throw new Error('CanvasThermostatsProvider is required.');
  return (
    <section className='canvas-thermostats' aria-label='Room temperatures'>
      <ul className='canvas-thermostats__rooms'>
        {controllers.map(({ room, target, current, unavailable, state, disabled, next, change, pending, feedback }) => (
          <li
            className='canvas-thermostats__room'
            key={room.id}
            data-state={state.toLowerCase()}
            style={{ '--canvas-room-accent': getRoomAccent(room.name) } as CSSProperties}
          >
            <span className='canvas-thermostats__artwork'>
              <RoomArtwork room={room.name} />
            </span>
            <div className='canvas-thermostats__info'>
              <div className='canvas-thermostats__heading'>
                <span className='canvas-thermostats__name'>{room.name}</span>
                <span className='canvas-thermostats__state'>{state}</span>
              </div>
              <span className='canvas-thermostats__current'>
                {!unavailable && numeric(current) ? `Currently ${format(current)}°C` : 'Temperature unavailable'}
              </span>
            </div>
            <div className='canvas-thermostats__adjust'>
              <span className='canvas-thermostats__target-label' role='status'>
                {pending ? 'Updating…' : 'Set to'}
              </span>
              <div className='canvas-thermostats__stepper'>
                <button
                  type='button'
                  aria-label={`Lower ${room.name} target temperature`}
                  disabled={disabled || next(-1) === target}
                  onClick={() => void change(-1)}
                >
                  <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
                    <path d='M6 12h12' />
                  </svg>
                </button>
                <output aria-label={`${room.name} target temperature`} aria-live='polite'>
                  {!unavailable && numeric(target) ? `${format(target)}°` : '—'}
                </output>
                <button
                  type='button'
                  aria-label={`Raise ${room.name} target temperature`}
                  disabled={disabled || next(1) === target}
                  onClick={() => void change(1)}
                >
                  <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
                    <path d='M6 12h12M12 6v12' />
                  </svg>
                </button>
              </div>
            </div>
            {feedback?.phase === 'accepted' && (
              <p className='canvas-thermostats__feedback' role='status'>
                Service accepted; waiting for the reported target.
              </p>
            )}
            {(feedback?.phase === 'failed' || feedback?.phase === 'unconfirmed') && (
              <p className='canvas-thermostats__feedback' role='alert'>
                {feedback.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

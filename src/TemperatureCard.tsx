import { useEffect, useRef, useState } from 'react';
import { useEntity, useStore } from '@hakit/core';

export function HeatIcon({ state }: { state: string }) {
  return (
    <svg
      className='temperature-icon'
      data-state={state}
      viewBox='0 0 32 32'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.7'
      strokeLinecap='round'
      aria-hidden='true'
    >
      <rect x='5' y='14' width='22' height='13' rx='3' />
      <path d='M10 18v5m6-5v5m6-5v5M8 27v2m16-2v2' />
      <g className='heat-waves'>
        <path d='M10 10c-3-3 3-3 0-6' />
        <path d='M16 10c-3-3 3-3 0-6' />
        <path d='M22 10c-3-3 3-3 0-6' />
      </g>
    </svg>
  );
}
const rooms = [
  { id: 'climate.thermostat_office', name: 'Office' },
  { id: 'climate.thermostat_gym', name: 'Gym' },
  { id: 'climate.thermostat_bedroom', name: 'Bedroom' },
] as const;
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const format = (value: number) => String(Number(value.toFixed(1)));
function RoomRow({ room }: { room: (typeof rooms)[number] }) {
  const entity = useEntity(room.id, { returnNullIfNotFound: true });
  const connected = useStore(s => Boolean(s.connection?.connected && s.connectionStatus === 'connected'));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const attributes = entity?.attributes;
  const target = attributes?.temperature;
  const current = attributes?.current_temperature;
  const unavailable = !connected || !entity || ['unavailable', 'unknown'].includes(entity.state);
  const state = unavailable
    ? 'unavailable'
    : entity.state === 'off'
      ? 'off'
      : attributes?.hvac_action === 'heating'
        ? 'heating'
        : attributes?.hvac_action === 'idle'
          ? 'idle'
          : 'unknown';
  const label = { unavailable: 'Unavailable', off: 'Off', heating: 'Heating', idle: 'Idle', unknown: 'Unknown' }[state];
  const min = attributes?.min_temp;
  const max = attributes?.max_temp;
  const step = numeric(attributes?.target_temp_step) && attributes.target_temp_step > 0 ? attributes.target_temp_step : 0.5;
  const disabled =
    unavailable ||
    state === 'off' ||
    pending ||
    !numeric(target) ||
    !numeric(min) ||
    !numeric(max) ||
    !((attributes?.supported_features ?? 0) & 1);
  const next = (direction: number) =>
    numeric(target) && numeric(min) && numeric(max) ? Number(Math.max(min, Math.min(max, target + direction * step)).toFixed(2)) : null;
  async function change(direction: number) {
    if (disabled || busy.current) return;
    const requested = next(direction);
    if (requested === null || requested === target) return;
    busy.current = true;
    setPending(true);
    setError(null);
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const { connection, connectionStatus } = useStore.getState();
      if (!connection?.connected || connectionStatus !== 'connected') throw new Error('Connection lost. Please try again.');
      const confirmation = new Promise<void>((resolve, reject) => {
        interval = setInterval(() => {
          const store = useStore.getState();
          if (!mounted.current) {
            reject(new Error('View closed'));
            return;
          }
          if (!store.connection?.connected) {
            reject(new Error('Connection lost. Check the current target before retrying.'));
            return;
          }
          const reported = store.entities[room.id];
          if (!reported || ['unknown', 'unavailable'].includes(reported.state)) {
            reject(new Error('Thermostat unavailable. Please try again.'));
            return;
          }
          if (numeric(reported.attributes.temperature) && Math.abs(reported.attributes.temperature - requested) < 0.01) resolve();
        }, 250);
      });
      await Promise.race([
        Promise.all([
          connection.sendMessagePromise({
            type: 'call_service',
            domain: 'climate',
            service: 'set_temperature',
            target: { entity_id: room.id },
            service_data: { temperature: requested },
          }),
          confirmation,
        ]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Change not confirmed. Check the current target before retrying.')), 15000);
        }),
      ]);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause && typeof cause === 'object' && 'message' in cause
            ? String(cause.message)
            : 'Could not update temperature. Please try again.'
        );
    } finally {
      clearInterval(interval);
      clearTimeout(timeout);
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <li className='temperature-room'>
      <span className='temperature-symbol'>
        <HeatIcon state={state} />
      </span>
      <div className='temperature-room-info'>
        <div className='temperature-room-heading'>
          <span className='temperature-room-name'>{room.name}</span>
          <span className='temperature-room-state'>{label}</span>
        </div>
        <span className='temperature-current'>
          {!unavailable && numeric(current) ? `Currently ${format(current)}°C` : 'Temperature unavailable'}
        </span>
      </div>
      <div className='temperature-adjust'>
        <span className='temperature-target-label' role='status'>
          {pending ? 'Updating…' : 'Set to'}
        </span>
        <div className='temperature-stepper'>
          <button
            type='button'
            aria-label={`Lower ${room.name} target temperature`}
            disabled={disabled || next(-1) === target}
            onClick={() => void change(-1)}
          >
            −
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
            +
          </button>
        </div>
      </div>
      {error && (
        <p className='temperature-error' role='alert'>
          {error}
        </p>
      )}
    </li>
  );
}
export function TemperatureCard() {
  return (
    <section className='appliances-card temperature-card' aria-labelledby='temperature-title'>
      <h2 id='temperature-title'>
        Room temperature <span>°C</span>
      </h2>
      <ul>
        {rooms.map(room => (
          <RoomRow key={room.id} room={room} />
        ))}
      </ul>
    </section>
  );
}

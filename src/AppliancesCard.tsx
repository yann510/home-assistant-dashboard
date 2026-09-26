import { ApplianceIcon, type ApplianceIconState } from './ApplianceIcon';
import { useApplianceClock } from './useApplianceClock';
import { runningApplianceStatus } from './applianceStatus';
import { useEntity, useStore } from '@hakit/core';

const appliances = [
  { id: 'washer', prefix: 'sensor.washer_washer', name: 'Washer' },
  { id: 'dryer', prefix: 'sensor.dryer_dryer', name: 'Dryer' },
  { id: 'dishwasher', prefix: 'sensor.dishwasher_dishwasher', name: 'Dishwasher' },
] as const;

function ApplianceRow({ appliance, now, connected }: { appliance: (typeof appliances)[number]; now: number; connected: boolean }) {
  const { prefix, name, id } = appliance;
  const machine = useEntity(`${prefix}_machine_state`, { returnNullIfNotFound: true });
  const job = useEntity(`${prefix}_job_state`, { returnNullIfNotFound: true });
  const completion = useEntity(`${prefix}_completion_time`, { returnNullIfNotFound: true });
  const state = machine?.state;
  const finished = ['finish', 'finished'].includes(job?.state ?? '');
  const iconState: ApplianceIconState =
    !connected || !machine || state === 'unavailable'
      ? 'unavailable'
      : state === 'run'
        ? finished
          ? 'idle'
          : 'running'
        : state === 'pause'
          ? 'paused'
          : state === 'stop'
            ? 'idle'
            : 'unknown';
  let status = 'Unknown';
  if (!connected || !machine || state === 'unavailable') status = 'Unavailable';
  else if (state === 'stop') status = 'Idle';
  else if (state === 'pause') status = 'Paused';
  else if (state === 'run') {
    status = finished ? 'Finished' : runningApplianceStatus(job?.state, completion?.state, now);
  }
  return (
    <li className='appliance-row' data-appliance={id} data-state={iconState}>
      <span className='appliance-icon' aria-hidden='true'>
        <ApplianceIcon kind={id} state={iconState} />
      </span>
      <span className='appliance-name'>{name}</span>
      <span className='appliance-status'>{status}</span>
    </li>
  );
}

export function AppliancesCard({ variant = 'classic' }: { variant?: 'classic' | 'canvas' }) {
  const now = useApplianceClock();
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  return (
    <section
      id='appliances-card'
      tabIndex={-1}
      className={`appliances-card${variant === 'canvas' ? ' canvas-appliances' : ''}`}
      aria-label={variant === 'canvas' ? 'Appliance status' : undefined}
      aria-labelledby={variant === 'classic' ? 'appliances-title' : undefined}
    >
      {variant === 'classic' && <h2 id='appliances-title'>Appliances</h2>}
      <ul>
        {appliances.map(appliance => (
          <ApplianceRow key={appliance.id} appliance={appliance} now={now} connected={connected} />
        ))}
      </ul>
    </section>
  );
}

import { ApplianceIcon, type ApplianceIconState } from './ApplianceIcon';
import { useEffect, useState } from 'react';
import { useEntity, useStore } from '@hakit/core';

const appliances = [
  { id: 'washer', prefix: 'sensor.washer_washer', name: 'Washer' },
  { id: 'dryer', prefix: 'sensor.dryer_dryer', name: 'Dryer' },
  { id: 'dishwasher', prefix: 'sensor.dishwasher_dishwasher', name: 'Dishwasher' },
] as const;
const activities: Record<string, string> = {
  wash: 'Washing',
  ai_wash: 'Washing',
  pre_wash: 'Prewashing',
  air_wash: 'Air washing',
  rinse: 'Rinsing',
  ai_rinse: 'Rinsing',
  spin: 'Spinning',
  ai_spin: 'Spinning',
  drying: 'Drying',
  ai_drying: 'Drying',
  cooling: 'Cooling',
  refreshing: 'Refreshing',
  weight_sensing: 'Sensing load',
  wrinkle_prevent: 'Wrinkle prevention',
  delay_wash: 'Delayed start',
  pre_drain: 'Draining',
  sanitizing: 'Sanitizing',
  dehumidifying: 'Dehumidifying',
  continuous_dehumidifying: 'Dehumidifying',
  internal_care: 'Internal care',
  freeze_protection: 'Freeze protection',
  thawing_frozen_inside: 'Thawing',
};

function ApplianceRow({ appliance, now, connected }: { appliance: (typeof appliances)[number]; now: number; connected: boolean }) {
  const { prefix, name, id } = appliance;
  const machine = useEntity(`${prefix}_machine_state`, { returnNullIfNotFound: true });
  const job = useEntity(`${prefix}_job_state`, { returnNullIfNotFound: true });
  const completion = useEntity(`${prefix}_completion_time`, { returnNullIfNotFound: true });
  const state = machine?.state;
  const iconState: ApplianceIconState =
    !connected || !machine || state === 'unavailable'
      ? 'unavailable'
      : state === 'run'
        ? 'running'
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
    status = activities[job?.state ?? ''] ?? 'Running';
    const finish = Date.parse(completion?.state ?? '');
    if (Number.isFinite(finish) && finish > now) {
      status += ` · ~${Math.ceil((finish - now) / 60_000)} min left`;
    }
  }
  return (
    <li className='appliance-row'>
      <span className='appliance-icon' aria-hidden='true'>
        <ApplianceIcon kind={id} state={iconState} />
      </span>
      <span className='appliance-name'>{name}</span>
      <span className='appliance-status'>{status}</span>
    </li>
  );
}

export function AppliancesCard() {
  const [now, setNow] = useState(() => Date.now());
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return (
    <section className='appliances-card' aria-labelledby='appliances-title'>
      <h2 id='appliances-title'>Appliances</h2>
      <ul>
        {appliances.map(appliance => (
          <ApplianceRow key={appliance.id} appliance={appliance} now={now} connected={connected} />
        ))}
      </ul>
    </section>
  );
}

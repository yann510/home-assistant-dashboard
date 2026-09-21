import type { ReactNode } from 'react';
import { useEntity, useStore } from '@hakit/core';
import { ApplianceIcon } from './ApplianceIcon';
import { runningApplianceStatus } from './applianceStatus';
import { useApplianceClock } from './useApplianceClock';
import './running.css';

type ActivityItem = { id: string; name: string; status: string; target: string; icon: ReactNode };

export function RunningPanel({ onNavigate }: { onNavigate?: (target: string) => void } = {}) {
  const nightMode = useEntity('input_boolean.night_mode', { returnNullIfNotFound: true });
  const night = nightMode?.state === 'on';
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const washerMachine = useEntity('sensor.washer_washer_machine_state', { returnNullIfNotFound: true });
  const washerJob = useEntity('sensor.washer_washer_job_state', { returnNullIfNotFound: true });
  const washerCompletion = useEntity('sensor.washer_washer_completion_time', { returnNullIfNotFound: true });
  const dryerMachine = useEntity('sensor.dryer_dryer_machine_state', { returnNullIfNotFound: true });
  const dryerJob = useEntity('sensor.dryer_dryer_job_state', { returnNullIfNotFound: true });
  const dryerCompletion = useEntity('sensor.dryer_dryer_completion_time', { returnNullIfNotFound: true });
  const dishwasherMachine = useEntity('sensor.dishwasher_dishwasher_machine_state', { returnNullIfNotFound: true });
  const dishwasherJob = useEntity('sensor.dishwasher_dishwasher_job_state', { returnNullIfNotFound: true });
  const dishwasherCompletion = useEntity('sensor.dishwasher_dishwasher_completion_time', { returnNullIfNotFound: true });
  const vacuum = useEntity('vacuum.roomba', { returnNullIfNotFound: true });
  const now = useApplianceClock();
  const appliances = [
    { id: 'washer', name: 'Washer', machine: washerMachine, job: washerJob, completion: washerCompletion },
    { id: 'dryer', name: 'Dryer', machine: dryerMachine, job: dryerJob, completion: dryerCompletion },
    { id: 'dishwasher', name: 'Dishwasher', machine: dishwasherMachine, job: dishwasherJob, completion: dishwasherCompletion },
  ] as const;
  const items: ActivityItem[] = appliances
    .filter(
      appliance => ['run', 'pause'].includes(appliance.machine?.state ?? '') && !['finish', 'finished'].includes(appliance.job?.state ?? '')
    )
    .map(appliance => ({
      id: appliance.id,
      name: appliance.name,
      status:
        appliance.machine?.state === 'pause' ? 'Paused' : runningApplianceStatus(appliance.job?.state, appliance.completion?.state, now),
      target: 'appliances-card',
      icon: <ApplianceIcon kind={appliance.id} state={appliance.machine?.state === 'pause' ? 'paused' : 'running'} />,
    }));
  if (vacuum?.state === 'cleaning' || vacuum?.state === 'returning') {
    items.push({
      id: 'roomba',
      name: 'Roomba',
      status: vacuum.state === 'cleaning' ? 'Cleaning' : 'Returning to dock',
      target: 'attention-target-vacuum',
      icon: (
        <svg className='appliance-status-icon' viewBox='0 0 32 32' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden='true'>
          <circle cx='16' cy='16' r='12' />
          <path d='M6 10h20M7 24h18' />
          <circle cx='16' cy='16' r='3' />
          <path d='M13 7h6' />
        </svg>
      ),
    });
  }
  if (!connected || !items.length) return null;
  return (
    <section className={`running-panel ${night ? 'running-quiet' : ''}`} aria-labelledby='running-title'>
      <h2 id='running-title'>
        In progress <span aria-hidden='true'>{items.length}</span>
      </h2>
      <ul>
        {items.map(item => (
          <li key={item.id}>
            <a
              href={`#${item.target}`}
              aria-label={`${item.name} ${item.status}`}
              onClick={event => {
                if (onNavigate) {
                  event.preventDefault();
                  onNavigate(item.target);
                  return;
                }
                const target = document.getElementById(item.target);
                if (!target) return;
                event.preventDefault();
                const reduced = night || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                target.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
                target.focus({ preventScroll: true });
              }}
            >
              {item.icon}
              <span className='running-copy'>
                <strong>{item.name}</strong>
                <span>{item.status}</span>
              </span>
              <span className='running-arrow' aria-hidden='true'>
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

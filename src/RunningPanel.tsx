import { useEntity, useStore } from '@hakit/core';
import { ApplianceIcon } from './ApplianceIcon';
import { runningApplianceStatus } from './applianceStatus';
import { useApplianceClock } from './useApplianceClock';
import './running.css';

export function RunningPanel() {
  const nightMode = useEntity('input_boolean.night_mode', { returnNullIfNotFound: true });
  const night = nightMode?.state === 'on';
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const washerMachine = useEntity('sensor.washer_washer_machine_state', { returnNullIfNotFound: true });
  const washerJob = useEntity('sensor.washer_washer_job_state', { returnNullIfNotFound: true });
  const washerCompletion = useEntity('sensor.washer_washer_completion_time', { returnNullIfNotFound: true });
  const dryerMachine = useEntity('sensor.dryer_dryer_machine_state', { returnNullIfNotFound: true });
  const dryerJob = useEntity('sensor.dryer_dryer_job_state', { returnNullIfNotFound: true });
  const dryerCompletion = useEntity('sensor.dryer_dryer_completion_time', { returnNullIfNotFound: true });
  const now = useApplianceClock();
  const active = [
    { id: 'washer', name: 'Washer', machine: washerMachine, job: washerJob, completion: washerCompletion },
    { id: 'dryer', name: 'Dryer', machine: dryerMachine, job: dryerJob, completion: dryerCompletion },
  ] as const;
  const running = active.filter(
    appliance => connected && appliance.machine?.state === 'run' && !['finish', 'finished'].includes(appliance.job?.state ?? '')
  );
  if (!running.length) return null;
  return (
    <section className={`running-panel ${night ? 'running-quiet' : ''}`} aria-labelledby='running-title'>
      <h2 id='running-title'>
        Running <span aria-hidden='true'>{running.length}</span>
      </h2>
      <ul>
        {running.map(appliance => (
          <li key={appliance.id}>
            <a
              href='#appliances-card'
              onClick={event => {
                const target = document.getElementById('appliances-card');
                if (!target) return;
                event.preventDefault();
                const reduced = night || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                target.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
                target.focus({ preventScroll: true });
              }}
            >
              <ApplianceIcon kind={appliance.id} state='running' />
              <span className='running-copy'>
                <strong>{appliance.name}</strong>
                <span>{runningApplianceStatus(appliance.job?.state, appliance.completion?.state, now)}</span>
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

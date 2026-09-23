import { useStore } from '@hakit/core';
import { useDeviceCommand } from './useDeviceCommand';

const modes = [
  { label: 'Day', id: 'input_boolean.morning_mode' },
  { label: 'Night', id: 'input_boolean.night_mode' },
] as const;
function ModeButton({ label, id }: { label: string; id: string }) {
  const state = useStore(store => store.entities[id]?.state);
  const connected = useStore(store => Boolean(store.connection?.connected && store.connectionStatus === 'connected'));
  const { send, pending, result } = useDeviceCommand();
  const failure = result?.results.find(item => item.phase === 'failed' || item.phase === 'unconfirmed');
  const phase = result?.results[0]?.phase;
  const known = state === 'on' || state === 'off';
  const desired = state === 'on' ? 'off' : 'on';
  return <><button type='button' aria-label={`${label} mode`} aria-pressed={state === 'on'}
    disabled={!connected || !known || pending}
    onClick={() => void send({ domain: 'input_boolean', service: desired === 'on' ? 'turn_on' : 'turn_off', targets: [id] },
      target => useStore.getState().entities[target]?.state === desired)}>{label}</button>
    {failure && <p className='canvas-modes__error' role='alert'>{failure.message}</p>}
    {!failure && phase && <span className='canvas-modes__status' role='status'>
      {phase === 'pending' ? 'Sending…' : phase === 'accepted' ? 'Accepted; waiting for state.' : 'State updated.'}
    </span>}</>;
}
export function CanvasModes() {
  return <div className='canvas-modes' role='group' aria-label='Home modes'>
    {modes.map(mode => <ModeButton key={mode.id} {...mode} />)}
  </div>;
}

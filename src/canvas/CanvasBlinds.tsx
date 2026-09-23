import { blindRooms, useCanvasBlinds, type BlindAction, type BlindRoom } from './useCanvasBlinds';
import type { TargetResult } from './commands';

const label = (room: BlindRoom) => room === 'living room' ? 'Living room' : room === 'bedroom' ? 'Bedroom' : 'Gym';
const actions: readonly BlindAction[] = ['open', 'stop', 'close'];
const actionLabel = (action: BlindAction) => action[0].toUpperCase() + action.slice(1);
function feedback(result: TargetResult) {
  if (result.phase === 'pending') return `${label(result.target as BlindRoom)} · Sending command…`;
  if (result.phase === 'accepted') return `${label(result.target as BlindRoom)} · Command sent · position unavailable`;
  if (result.phase === 'unconfirmed') return `${label(result.target as BlindRoom)} · Unconfirmed: ${result.message ?? 'Check the blinds before trying again.'} Position unavailable.`;
  return `${label(result.target as BlindRoom)} · ${result.message ?? 'Command failed. Try again.'}`;
}

export function CanvasBlinds({ initialRoom }: { initialRoom?: BlindRoom } = {}) {
  const { selection, toggleRoom, run, retryFailed, failedRooms, results, pending, movingRooms, connected } = useCanvasBlinds(initialRoom);
  return <section className='canvas-blinds' aria-label='Blinds'>
    <div className='canvas-blinds__heading'><div><span className='canvas__eyebrow'>Blinds</span><h2>Let the light in.</h2></div><span className='canvas-blinds__caption'>Choose rooms</span></div>
    <div className='canvas-blinds__rooms' role='group' aria-label='Rooms to control blinds'>
      {blindRooms.map(room => <button key={room} type='button' aria-label={`${label(room)} blinds`} aria-pressed={selection.includes(room)}
        onClick={() => toggleRoom(room)}>{selection.includes(room) ? '✓ ' : '+ '}{label(room)}</button>)}
    </div>
    <div className='canvas-blinds__actions'>
      {actions.map(action => <button key={action} type='button'
        aria-label={action === 'stop' && movingRooms.length ? `Stop moving blinds in ${movingRooms.map(label).join(', ')}` : `${actionLabel(action)} selected blinds`}
        disabled={!connected || !(action === 'stop' ? movingRooms.length || selection.length : selection.length) || pending[action] || (action !== 'stop' && (pending.open || pending.close))}
        onClick={() => void run(action)}>{actionLabel(action)}</button>)}
    </div>
    <p className='canvas-blinds__caption' role='status'>
      {!connected ? 'Home Assistant is disconnected. Reconnect to control blinds.' : selection.length ? `${selection.map(label).join(' + ')} selected` : 'Select one or more rooms above'}
    </p>
    {movingRooms.length > 0 && <p className='canvas-blinds__caption'>Movement request pending for {movingRooms.map(label).join(' + ')}. Stop targets these rooms.</p>}
    {actions.map(action => results[action] && <div key={action} className='canvas-blinds__results' role='group' aria-label={`${actionLabel(action)} blind command results`}>
      <strong>{actionLabel(action)}</strong>
      {results[action]!.results.map(result => <p key={result.target} className={result.phase === 'failed' || result.phase === 'unconfirmed' ? 'canvas-blinds__error' : ''}
        role={result.phase === 'failed' || result.phase === 'unconfirmed' ? 'alert' : undefined}>{feedback(result)}</p>)}
      {failedRooms[action].length > 0 && <button type='button' aria-label={`Retry ${actionLabel(action)} for failed rooms`}
        disabled={!connected || pending[action] || (action !== 'stop' && (pending.open || pending.close))}
        onClick={() => void retryFailed(action)}>Retry {failedRooms[action].map(label).join(' + ')}</button>}
    </div>)}
  </section>;
}

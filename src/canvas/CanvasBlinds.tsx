import {
  blindRooms,
  CanvasBlindsProvider,
  useCanvasBlinds,
  useCanvasBlindsProviderPresent,
  type BlindAction,
  type BlindRoom,
} from './useCanvasBlinds';
import type { TargetResult } from './commands';
import './canvas-blinds.css';

const label = (room: BlindRoom) => (room === 'living room' ? 'Living room' : room === 'bedroom' ? 'Bedroom' : 'Gym');
const actions: readonly BlindAction[] = ['open', 'stop', 'close'];
const actionLabel = (action: BlindAction) => action[0].toUpperCase() + action.slice(1);
function feedback(result: TargetResult) {
  if (result.phase === 'pending') return `${label(result.target as BlindRoom)} · Sending command…`;
  if (result.phase === 'accepted') return `${label(result.target as BlindRoom)} · Command sent · position unavailable`;
  if (result.phase === 'unconfirmed')
    return `${label(result.target as BlindRoom)} · Unconfirmed: ${result.message ?? 'Check the blinds before trying again.'} Position unavailable.`;
  return `${label(result.target as BlindRoom)} · ${result.message ?? 'Command failed. Try again.'}`;
}

export function CanvasBlinds({ initialRoom }: { initialRoom?: BlindRoom } = {}) {
  const hasProvider = useCanvasBlindsProviderPresent();
  if (!hasProvider)
    return (
      <CanvasBlindsProvider>
        <CanvasBlindsView initialRoom={initialRoom} />
      </CanvasBlindsProvider>
    );
  return <CanvasBlindsView initialRoom={initialRoom} />;
}

function CanvasBlindsView({ initialRoom }: { initialRoom?: BlindRoom }) {
  const { selection, toggleRoom, run, retryFailed, failedRooms, results, pending, movingRooms, connected } = useCanvasBlinds(initialRoom);
  const differentStopTargets = movingRooms.length > 0 &&
    (movingRooms.length !== selection.length || movingRooms.some(room => !selection.includes(room)));
  return (
    <section className='canvas-blinds' aria-label='Blinds'>
      <div className='canvas-blinds__heading'>
        <h2>Blinds</h2>
      </div>
      <div className='canvas-blinds__rooms' role='group' aria-label='Rooms to control blinds'>
        {blindRooms.map(room => (
          <button
            key={room}
            type='button'
            data-room={room}
            aria-label={`${label(room)} blinds`}
            aria-pressed={selection.includes(room)}
            onClick={() => toggleRoom(room)}
          >
            <svg className='canvas-blinds__window' viewBox='0 0 36 46' aria-hidden='true' focusable='false'>
              {room === 'living room' ? (
                <>
                  <circle className='canvas-blinds__sun' cx='26' cy='10' r='4' />
                  <rect className='canvas-blinds__glass' x='7' y='19' width='22' height='15' rx='4' />
                  <path className='canvas-blinds__frame' d='M7 27v-4q0-4 4-4h14q4 0 4 4v4M7 39v3M29 39v3M8 32h20M18 21v10' />
                  <path className='canvas-blinds__frame' d='M3 38V28a3 3 0 0 1 6 0v5h18v-5a3 3 0 0 1 6 0v10ZM26 2v1M18 10h-1M33 10h1' />
                </>
              ) : room === 'bedroom' ? (
                <>
                  <path className='canvas-blinds__moon' d='M26 3a7 7 0 1 0 3 12 8 8 0 0 1-3-12Z' />
                  <rect className='canvas-blinds__glass' x='4' y='28' width='28' height='10' rx='2' />
                  <path
                    className='canvas-blinds__frame'
                    d='M4 42V22M32 42V28M4 38h28M4 29h28M8 28v-5q0-2 2-2h5q2 0 2 2v5M20 28v-5q0-2 2-2h5q2 0 2 2v5'
                  />
                </>
              ) : (
                <>
                  <circle className='canvas-blinds__sun' cx='18' cy='9' r='4' />
                  <path className='canvas-blinds__frame' d='M18 2V1M11 9H9M25 9h2M18 16v1M10 27h16M10 31h16' />
                  <rect className='canvas-blinds__glyph-fill' x='5' y='21' width='5' height='17' rx='1.5' />
                  <rect className='canvas-blinds__glyph-fill' x='26' y='21' width='5' height='17' rx='1.5' />
                  <path className='canvas-blinds__frame' d='M5 21h5v17H5ZM26 21h5v17h-5ZM2 25v9M34 25v9' />
                </>
              )}
            </svg>
            <span>{label(room)}</span>
          </button>
        ))}
      </div>
      <div className='canvas-blinds__actions'>
        {actions.map(action => (
          <button
            key={action}
            type='button'
            aria-label={
              action === 'stop' && movingRooms.length
                ? `Stop recently requested blinds in ${movingRooms.map(label).join(', ')}`
                : `${actionLabel(action)} selected blinds`
            }
            disabled={
              !connected ||
              !(action === 'stop' ? movingRooms.length || selection.length : selection.length) ||
              pending[action] ||
              (action !== 'stop' && (pending.open || pending.close || pending.stop))
            }
            aria-busy={pending[action]}
            onClick={() => void run(action)}
          >
            <svg viewBox='0 0 20 20' aria-hidden='true' focusable='false'>
              {action === 'stop' ? (
                <rect x='5' y='5' width='10' height='10' rx='2' />
              ) : (
                <path d={action === 'open' ? 'm5 11 5-5 5 5M10 6v10' : 'm5 9 5 5 5-5M10 4v10'} />
              )}
            </svg>
            <span className='canvas-blinds__action-label'>{actionLabel(action)}</span>
            {pending[action] && <span className='canvas-blinds__action-pending'>Sending…</span>}
          </button>
        ))}
      </div>
      {(!connected || !selection.length) && (
        <p className='canvas-blinds__caption' role='status'>
          {!connected ? 'Home Assistant is disconnected. Reconnect to control blinds.' : 'Select one or more rooms above'}
        </p>
      )}
      {differentStopTargets && (
        <p className='canvas-blinds__caption'>
          Stop targets {movingRooms.map(label).join(' + ')}.
        </p>
      )}
      {actions.map(
        action =>
          results[action] && (
            <div
              key={action}
              className='canvas-blinds__results'
              data-has-issue={results[action]!.results.some(result => result.phase === 'failed' || result.phase === 'unconfirmed')}
              role='group'
              aria-label={`${actionLabel(action)} blind command results`}
            >
              <strong>{actionLabel(action)}</strong>
              {results[action]!.results.map(result => (
                <p
                  key={result.target}
                  data-phase={result.phase}
                  className={result.phase === 'failed' || result.phase === 'unconfirmed' ? 'canvas-blinds__error' : ''}
                  role={result.phase === 'failed' || result.phase === 'unconfirmed' ? 'alert' : undefined}
                >
                  {feedback(result)}
                </p>
              ))}
              {failedRooms[action].length > 0 && (
                <button
                  type='button'
                  aria-label={`Retry ${actionLabel(action)} for failed rooms`}
                  disabled={!connected || pending[action] || (action !== 'stop' && (pending.open || pending.close || pending.stop))}
                  onClick={() => void retryFailed(action)}
                >
                  Retry {failedRooms[action].map(label).join(' + ')}
                </button>
              )}
            </div>
          )
      )}
    </section>
  );
}

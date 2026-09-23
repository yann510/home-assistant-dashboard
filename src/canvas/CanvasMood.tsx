import type { HouseMoodCardProps, MoodId } from '../HouseMoodCard';

const moods: { id: MoodId; name: string; colour: string; caption: string }[] = [
  { id: 'love', name: 'Love', colour: '#efa5a5', caption: 'A little closer.' },
  { id: 'unwind', name: 'Unwind', colour: '#cbb5ed', caption: 'Let the day drift away.' },
  { id: 'dinner', name: 'Dinner', colour: '#efbe83', caption: 'Good food. Better company.' },
  { id: 'party', name: 'Party', colour: '#c5d68c', caption: 'Turn a little louder.' },
  { id: 'gym', name: 'Gym', colour: '#9ccfd1', caption: 'Find your rhythm.' },
];

function MoodArt({ id }: { id: MoodId | null }) {
  return (
    <svg className='canvas-mood__art' viewBox='0 0 320 260' fill='none' stroke='currentColor' strokeWidth='18' aria-hidden='true'>
      {id === 'love' ? (
        <path d='M160 214C130 180 40 135 40 76a62 62 0 01120-17 62 62 0 01120 17c0 59-90 104-120 138z' />
      ) : id === 'dinner' ? (
        <>
          <circle cx='160' cy='130' r='91' />
          <circle cx='160' cy='130' r='59' />
          <path d='M34 40v190M16 40v50h36V40M287 40v190' />
        </>
      ) : id === 'party' ? (
        <path d='M160 12l23 64 64-31-31 64 65 23-65 23 31 64-64-31-23 64-23-64-64 31 31-64-65-23 65-23-31-64 64 31z' />
      ) : id === 'gym' ? (
        <path d='M58 217L146 38h76l-88 179zM160 217l88-179' />
      ) : (
        <>
          <path d='M0 170C70 170 80 20 160 20S240 170 320 170' />
          <path d='M0 205C70 205 80 55 160 55S240 205 320 205' />
          <path d='M0 240C70 240 80 90 160 90S240 240 320 240' />
        </>
      )}
    </svg>
  );
}

export function CanvasMood({
  controller,
  onExplore,
  detail = false,
}: {
  controller: HouseMoodCardProps;
  onExplore?: () => void;
  detail?: boolean;
}) {
  const { status, connected, available, onActivate, onEnd, onRetry } = controller;
  const busy = status.phase === 'starting' || status.phase === 'restoring';
  const recovery = status.phase === 'recovery_required';
  const current = moods.find(mood => mood.id === (status.pendingMood ?? status.activeMood));
  const locked = !connected || !available || busy || recovery;
  const message = !connected
    ? 'Reconnecting to Home Assistant…'
    : !available
      ? 'House moods are unavailable.'
      : status.phase === 'starting'
        ? 'Starting mood…'
        : status.phase === 'restoring'
          ? 'Restoring previous settings…'
          : recovery
            ? 'Restoration needs attention.'
            : status.activeMood
              ? 'House mood is on'
              : 'No mood active';
  return (
    <section
      className={`canvas-mood${detail ? ' canvas-mood--detail' : ''}`}
      style={{ background: current?.colour ?? '#cbb5ed' }}
      aria-label='House Mood'
    >
      <div className='canvas-mood__copy'>
        <span className='canvas__eyebrow'>The feeling of home</span>
        <h2>{current?.name ?? 'Just be.'}</h2>
        <p>{current?.caption ?? 'Your space. Your own pace.'}</p>
        <div className='canvas-mood__status' role='status'>
          <span aria-hidden='true'>●</span> {message}
        </div>
        {status.errors.length > 0 && (
          <div role='alert' className='canvas-mood__error'>
            {status.errors.map((error, index) => (
              <p key={`${error.target}-${index}`}>{error.message}</p>
            ))}
          </div>
        )}
        <div className='canvas-mood__actions'>
          {onExplore && (
            <button type='button' onClick={onExplore}>
              Explore moods
            </button>
          )}
          {recovery ? (
            <button type='button' disabled={!connected || !available || busy} onClick={onRetry}>
              Retry restoration
            </button>
          ) : (
            status.activeMood && (
              <button type='button' disabled={!connected || !available || busy} onClick={onEnd}>
                End mood
              </button>
            )
          )}
        </div>
      </div>
      <MoodArt id={current?.id ?? null} />
      <div className='canvas-mood__picker' role='group' aria-label='Choose a house mood'>
        {moods.map(mood => (
          <button
            key={mood.id}
            type='button'
            aria-label={`${mood.name} mood`}
            aria-pressed={status.activeMood === mood.id}
            disabled={locked || status.activeMood === mood.id}
            onClick={() => onActivate(mood.id)}
          >
            {mood.name}
          </button>
        ))}
      </div>
    </section>
  );
}

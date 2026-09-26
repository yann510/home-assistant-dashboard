import { moodPresets as moods } from './moodPresets';

export type MoodId = 'love' | 'unwind' | 'dinner' | 'party' | 'gym';
export type MoodPhase = 'idle' | 'starting' | 'active' | 'restoring' | 'recovery_required';
export type MoodStatus = {
  phase: MoodPhase;
  activeMood: MoodId | null;
  pendingMood: MoodId | null;
  errors: { target: string; message: string }[];
};
export type HouseMoodCardProps = {
  status: MoodStatus;
  connected: boolean;
  available: boolean;
  onActivate: (mood: MoodId) => void;
  onEnd: () => void;
  onRetry: () => void;
};

export function HouseMoodCard({ status, connected, available, onActivate, onEnd, onRetry }: HouseMoodCardProps) {
  const pending = status.phase === 'starting' || status.phase === 'restoring';
  const recovering = status.phase === 'recovery_required';
  const locked = !connected || !available || pending || recovering;
  const message = !connected
    ? 'Reconnecting to Home Assistant…'
    : !available
      ? 'House moods are unavailable.'
      : status.phase === 'starting'
        ? 'Starting…'
        : status.phase === 'restoring'
          ? 'Restoring…'
          : recovering
            ? 'Restoration needs attention.'
            : '';

  return (
    <section className='house-mood-card' data-mood={status.activeMood ?? undefined} aria-labelledby='house-mood-title'>
      <header className='house-mood-header'>
        <h2 id='house-mood-title'>House Mood</h2>
        {(status.activeMood || status.phase === 'restoring') && !recovering && (
          <button className='house-mood-action' type='button' disabled={!connected || !available || pending} onClick={onEnd}>
            {status.phase === 'restoring' ? 'Restoring…' : 'End mood'}
          </button>
        )}
      </header>
      <div className='house-mood-grid'>
        {moods.map(mood => (
          <button
            key={mood.id}
            type='button'
            className='house-mood-preset'
            data-mood={mood.id}
            aria-label={mood.name}
            aria-pressed={status.activeMood === mood.id}
            disabled={locked}
            onClick={() => {
              if (!locked && status.activeMood !== mood.id) onActivate(mood.id);
            }}
          >
            <img className='house-mood-photo' src={mood.photo} alt='' draggable={false} />
            <span className='house-mood-shade' aria-hidden='true' />
            <span className='house-mood-name'>{mood.name}</span>
            {status.phase === 'starting' && status.pendingMood === mood.id ? (
              <span className='house-mood-check house-mood-spinner' aria-hidden='true' />
            ) : (
              status.activeMood === mood.id && (
                <span className='house-mood-active' aria-hidden='true'>Active</span>
              )
            )}
          </button>
        ))}
      </div>
      <span
        className={!connected || !available || recovering ? 'house-mood-notice' : 'house-mood-status-hidden'}
        role='status'
        aria-live='polite'
      >
        {message}
      </span>
      {status.errors.length > 0 && (
        <div className='house-mood-errors' role='alert'>
          {status.errors.map((error, index) => (
            <p key={`${error.target}-${index}`}>{error.message}</p>
          ))}
        </div>
      )}
      {recovering && (
        <button className='house-mood-action' type='button' disabled={!connected || !available || pending} onClick={onRetry}>
          Retry restoration
        </button>
      )}
    </section>
  );
}

import type { HouseMoodCardProps } from './HouseMoodCard';
import { moodPresets } from './moodPresets';
export function QuietMoodCard({ status, connected, available, onEnd, onRetry, onOpen }: HouseMoodCardProps & { onOpen: () => void }) {
  const current = moodPresets.find(mood => mood.id === (status.pendingMood ?? status.activeMood));
  const busy = status.phase === 'starting' || status.phase === 'restoring';
  const recovery = status.phase === 'recovery_required';
  const message = !connected
    ? 'Reconnecting to Home Assistant…'
    : !available
      ? 'House moods are unavailable.'
      : status.phase === 'starting'
        ? 'Starting mood…'
        : status.phase === 'restoring'
          ? 'Restoring your previous settings…'
          : recovery
            ? 'Restoration needs attention.'
            : status.activeMood
              ? 'Active across your home'
              : 'Choose the atmosphere for your home.';
  return (
    <section className='house-mood-card quiet-mood-card' data-mood={current?.id} aria-label='House Mood'>
      <h2>House Mood</h2>
      <div className='quiet-mood-photo'>
        {current && <img src={current.photo} alt='' />}
        <div className='quiet-mood-caption'>
          <h3>{current?.name ?? (recovery ? 'Finish restoring' : 'Make yourself at home')}</h3>
          <p role='status'>{message}</p>
        </div>
      </div>
      <div className='quiet-mood-actions'>
        <button className='house-mood-action' type='button' onClick={onOpen}>
          {status.activeMood ? 'Change mood' : 'Choose a mood'}
        </button>
        {recovery ? (
          <button className='house-mood-action' type='button' disabled={!connected || !available || busy} onClick={onRetry}>
            Retry restoration
          </button>
        ) : (
          status.activeMood && (
            <button className='house-mood-action' type='button' disabled={!connected || !available || busy} onClick={onEnd}>
              End mood
            </button>
          )
        )}
      </div>
      {status.errors.length > 0 && (
        <div className='house-mood-errors' role='alert'>
          {status.errors.map((error, i) => (
            <p key={i}>{error.message}</p>
          ))}
        </div>
      )}
    </section>
  );
}

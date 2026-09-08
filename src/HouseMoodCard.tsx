export type MoodId = 'love' | 'unwind' | 'dinner' | 'party';
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
const moods = [
  { id: 'love', name: 'Love', icon: '♡' },
  { id: 'unwind', name: 'Unwind', icon: '☀' },
  { id: 'dinner', name: 'Dinner', icon: '🍷' },
  { id: 'party', name: 'Party', icon: '✦' },
] as const;

export function HouseMoodCard({ status, connected, available, onActivate, onEnd, onRetry }: HouseMoodCardProps) {
  const pending = status.phase === 'starting' || status.phase === 'restoring';
  const recovering = status.phase === 'recovery_required';
  const locked = !connected || !available || pending || recovering;
  const activeName = moods.find(mood => mood.id === status.activeMood)?.name;
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
            : activeName
              ? `${activeName} is on`
              : '';

  return (
    <section className='house-mood-card' data-mood={status.activeMood ?? undefined} aria-labelledby='house-mood-title'>
      <h2 id='house-mood-title'>House Mood</h2>
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
            <span className='house-mood-icon' aria-hidden='true'>
              {mood.icon}
            </span>
            <span>{mood.name}</span>
            {status.phase === 'starting' && status.pendingMood === mood.id ? (
              <span className='house-mood-spinner' aria-hidden='true' />
            ) : (
              status.activeMood === mood.id && <span aria-hidden='true'>✓</span>
            )}
          </button>
        ))}
      </div>
      <div className='house-mood-footer'>
        <span role='status' aria-live='polite'>
          {message}
        </span>
        {status.activeMood && !recovering && (
          <button className='house-mood-action' type='button' disabled={!connected || !available || pending} onClick={onEnd}>
            End mood
          </button>
        )}
      </div>
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

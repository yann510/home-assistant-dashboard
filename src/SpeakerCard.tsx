import { SpeakerPlayer } from './SpeakerPlayer';
import { useSpeakerSession } from './useSpeakerSession';

export function SpeakerCard({ compact = false }: { compact?: boolean } = {}) {
  const {
    entityId,
    targets,
    coordinator,
    following,
    updating,
    canRetryCleanup,
    configured,
    connected,
    canToggle,
    busy,
    error,
    updateFollowing,
  } = useSpeakerSession();

  return (
    <section className={`speaker-card${compact ? ' speaker-card--compact' : ''}`} aria-label='Speakers'>
      <SpeakerPlayer compact={compact} key={entityId} entityId={entityId} members={targets} />
      <div className='speaker-group-control'>
        <div className='speaker-group-description'>
          <span className='speaker-group-title'>Follow me</span>
          <span id='speaker-group-description'>
            {!connected
              ? 'Reconnecting to Home Assistant…'
              : !configured
                ? 'Follow me is not available in Home Assistant.'
                : updating
                  ? 'Updating Follow me…'
                  : canRetryCleanup
                    ? 'Motion following is off. Retry returning audio to the original speaker.'
                    : following
                      ? 'Rooms join when motion is detected. Off keeps the original speaker.'
                      : coordinator
                        ? `Follow audio from ${coordinator.attributes.friendly_name} on motion`
                        : 'Start audio on a speaker to enable Follow me'}
          </span>
        </div>
        <button
          type='button'
          role='switch'
          aria-label='Follow me'
          aria-describedby='speaker-group-description'
          aria-checked={following}
          aria-busy={updating}
          className='speaker-group-toggle'
          disabled={busy || !canToggle}
          onClick={() => updateFollowing(following ? 'disable' : 'enable')}
        >
          <span className='speaker-group-track' aria-hidden='true'>
            <span />
          </span>
          <span aria-hidden='true'>{following ? 'On' : 'Off'}</span>
        </button>
      </div>
      {canRetryCleanup && (
        <button
          type='button'
          className='speaker-group-retry'
          disabled={!connected || !configured}
          onClick={() => updateFollowing('disable')}
        >
          Retry ungrouping
        </button>
      )}
      {error && (
        <p className='speaker-group-error' role='alert'>
          {error}
        </p>
      )}
    </section>
  );
}

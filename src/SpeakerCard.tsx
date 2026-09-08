import { useRef, useState } from 'react';
import { useEntity, useStore } from '@hakit/core';
import { SpeakerPlayer } from './SpeakerPlayer';

const speakerIds = ['media_player.living_room', 'media_player.bathroom', 'media_player.bedroom', 'media_player.gym'] as const;

export function SpeakerCard() {
  const speakers = [
    useEntity('media_player.living_room', { returnNullIfNotFound: true }),
    useEntity('media_player.bathroom', { returnNullIfNotFound: true }),
    useEntity('media_player.bedroom', { returnNullIfNotFound: true }),
    useEntity('media_player.gym', { returnNullIfNotFound: true }),
  ];
  const followMode = useEntity('input_boolean.speaker_follow_motion', { returnNullIfNotFound: true });
  const followSource = useEntity('input_text.speaker_follow_source', { returnNullIfNotFound: true });
  const followScript = useEntity('script.speaker_follow_motion', { returnNullIfNotFound: true });
  const connection = useStore(state => state.connection);
  const connectionStatus = useStore(state => state.connectionStatus);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = speakers.filter(
    (speaker): speaker is NonNullable<typeof speaker> => speaker !== null && !['unavailable', 'unknown'].includes(speaker.state)
  );

  const following = followMode?.state === 'on';
  const savedSource = speakerIds.find(id => id === followSource?.state);
  const cleanupPending = !following && Boolean(savedSource);
  // Disabling clears the mode before unjoining and clearing the saved source.
  // That intermediate state is progress, not a failed cleanup.
  const updating = busy || followScript?.state === 'on';
  const canRetryCleanup = cleanupPending && !updating && followScript?.state === 'off';
  const configured = [followMode, followSource, followScript].every(entity => entity && !['unknown', 'unavailable'].includes(entity.state));
  // Keep controlling the saved source while following, even if another room starts audio.
  const selected =
    (following || cleanupPending ? speakers.find(speaker => speaker?.entity_id === savedSource) : undefined) ??
    available.find(speaker => ['playing', 'buffering'].includes(speaker.state)) ??
    available.find(speaker => (speaker.attributes.group_members?.length ?? 0) > 1) ??
    available.find(speaker => speaker.state === 'paused');
  const coordinatorId = selected?.attributes.group_members?.[0] ?? selected?.entity_id;
  const coordinator = speakers.find(speaker => speaker?.entity_id === coordinatorId);
  const members = selected?.attributes.group_members ?? (coordinatorId ? [coordinatorId] : []);
  const connected = connection?.connected && connectionStatus === 'connected';
  const canToggle = Boolean(
    connected && configured && !cleanupPending && (following || (coordinator && !['unavailable', 'unknown'].includes(coordinator.state)))
  );

  async function updateFollowing(command: 'enable' | 'disable') {
    if (inFlight.current || !connected || !configured || !connection) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Reuse the authenticated socket, including when embedded in the HA app.
      // Separate HTTP calls can target the wrong origin or use an expired token.
      const result = await Promise.race([
        connection.sendMessagePromise<{ response?: { success?: boolean; error?: string } }>({
          type: 'call_service',
          domain: 'script',
          service: 'speaker_follow_motion',
          return_response: true,
          service_data: command === 'enable' ? { command, source_entity: coordinatorId } : { command },
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Home Assistant did not respond.')), 30000);
        }),
      ]);
      if (result.response?.success !== true) {
        throw new Error(result.response?.error ?? 'Home Assistant did not finish the command. Please try again.');
      }
    } catch (cause) {
      const detail = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Please try again.';
      setError(`Could not ${command === 'enable' ? 'enable' : 'finish turning off'} Follow me. ${detail}`);
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className='speaker-card' aria-label='Speakers'>
      <SpeakerPlayer
        key={coordinator?.entity_id ?? 'media_player.living_room'}
        entityId={speakerIds.find(id => id === coordinator?.entity_id) ?? 'media_player.living_room'}
        members={speakerIds.filter(id => members.includes(id))}
      />
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

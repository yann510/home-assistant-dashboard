import { useCanvasMusic } from './CanvasMusicProvider';

export function CanvasFollow() {
  const { session: s, rooms } = useCanvasMusic();
  return (
    <div className='canvas-music__follow'>
      <button
        type='button'
        role='switch'
        aria-label='Follow me'
        aria-checked={s.following}
        aria-busy={s.updating}
        disabled={s.updating || rooms.busy || !s.canToggle}
        onClick={() => void s.updateFollowing(s.following ? 'disable' : 'enable')}
      >
        Follow me <span>{s.following ? 'On' : 'Off'}</span>
      </button>
      {s.updating && <p role='status'>Updating Follow me…</p>}
      {!s.connected ? (
        <p role='status'>Reconnecting to Home Assistant…</p>
      ) : !s.configured ? (
        <p>Follow me is not available in Home Assistant.</p>
      ) : null}
      {s.canRetryCleanup && (
        <>
          <p>Motion following is off. Return audio to the original speaker.</p>
          <button disabled={rooms.busy || !s.connected || !s.configured} onClick={() => void s.updateFollowing('disable')}>
            Retry ungrouping
          </button>
        </>
      )}
      {s.error && <p role='alert'>{s.error}</p>}
    </div>
  );
}
export function CanvasTransport() {
  const { playback, disabled, playing, idle, attributes } = useCanvasMusic();
  const features = attributes?.supported_features ?? 0;
  if (idle) return null;
  return (
    <div className='canvas-music__transport' aria-label='Playback controls' aria-busy={playback.busy}>
      <button
        aria-label='Previous track'
        disabled={disabled || playback.busy || !(features & 16)}
        onClick={() => void playback.transport('media_previous_track', 'play the previous track')}
      >
        ⏮
      </button>
      <button
        aria-label={playing ? 'Pause' : 'Resume'}
        disabled={disabled || playback.busy || !(features & (playing ? 1 : 16384))}
        onClick={() => void playback.transport(playing ? 'media_pause' : 'media_play', playing ? 'pause playback' : 'start playback')}
      >
        {playing ? 'Ⅱ' : '▶'}
      </button>
      <button
        aria-label='Next track'
        disabled={disabled || playback.busy || !(features & 32)}
        onClick={() => void playback.transport('media_next_track', 'play the next track')}
      >
        ⏭
      </button>
      {playback.error && <p role='alert'>{playback.error}</p>}
    </div>
  );
}
export function CanvasMusic({ onOpenPlayer, onOpenSpeakers }: { onOpenPlayer(): void; onOpenSpeakers(): void }) {
  const { session, title, attributes, idle, rooms } = useCanvasMusic();
  function openSpeakers() {
    if (!rooms.busy) rooms.begin();
    onOpenSpeakers();
  }
  return (
    <section className='canvas__music canvas-music' aria-label='Music'>
      <span className='canvas__eyebrow'>Music, for this moment</span>
      <button className='canvas-music__title' aria-label='Open player' onClick={onOpenPlayer}>
        {title}
      </button>
      {!idle && attributes?.media_artist && <p>{attributes.media_artist}</p>}
      <button className='canvas-music__room' aria-label='Open speakers' onClick={openSpeakers}>
        {attributes?.friendly_name ?? 'Speakers'}
        {session.targets.length > 1 ? ` +${session.targets.length - 1}` : ''} ↗
      </button>
      <CanvasTransport />
      <div className='canvas-music__shortcuts'>
        <CanvasFollow />
        <button aria-label='Open speaker volume' onClick={openSpeakers}>
          Volume {Number.isFinite(attributes?.volume_level) ? `${Math.round(attributes!.volume_level! * 100)}%` : '—'}
        </button>
      </div>
      <svg className='canvas-music__art' viewBox='0 0 200 160' aria-hidden='true'>
        <circle cx='140' cy='80' r='70' />
        <circle cx='140' cy='80' r='45' />
        <circle cx='140' cy='80' r='20' />
      </svg>
    </section>
  );
}

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useEntity, type EntityName, type FilterByDomain } from '@hakit/core';
import { useSpeakerCommand } from './useSpeakerCommand';

function timeLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function SpeakerSeek({ entityId, disabled }: { entityId: FilterByDomain<EntityName, 'media_player'>; disabled: boolean }) {
  const entity = useEntity(entityId, { returnNullIfNotFound: true });
  const attributes = entity?.attributes;
  const duration = attributes?.media_duration ?? 0;
  const playing = entity?.state === 'playing';
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number; value: number } | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { send, error } = useSpeakerCommand();
  const updated = new Date(attributes?.media_position_updated_at ?? '').getTime();
  const elapsed = playing && Number.isFinite(updated) ? Math.max(0, (now - updated) / 1000) : 0;
  const position = Math.max(0, Math.min(duration, (attributes?.media_position ?? 0) + elapsed));
  const value = draft ?? position;
  const canSeek = Boolean((attributes?.supported_features ?? 0) & 2);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(settle.current);
    };
  }, []);

  async function commit(next: number) {
    if (disabled || !canSeek || inFlight.current) return;
    clearTimeout(settle.current);
    inFlight.current = true;
    setBusy(true);
    const clamped = Math.max(0, Math.min(duration, next));
    setDraft(clamped);
    const success = await send('media_seek', [entityId], 'change track position', { seek_position: clamped });
    inFlight.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (!success) setDraft(null);
    else
      settle.current = setTimeout(() => {
        if (mounted.current && !gesture.current && !inFlight.current) setDraft(null);
      }, 1500);
  }

  function pointerPosition(event: PointerEvent<HTMLInputElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    // Match the native 16px thumb's travel, including the ends of the track.
    return Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left - 8) / Math.max(1, rect.width - 16))) * duration);
  }
  function cancel() {
    if (!gesture.current) return;
    gesture.current = null;
    setDragging(false);
    setDraft(null);
  }
  function vertical(event: PointerEvent<HTMLInputElement>) {
    const start = gesture.current;
    return start && Math.abs(event.clientY - start.y) > 8 && Math.abs(event.clientY - start.y) > Math.abs(event.clientX - start.x);
  }

  if (!Number.isFinite(duration) || duration <= 0 || !['playing', 'paused', 'buffering'].includes(entity?.state ?? '')) return null;
  return (
    <div className={`speaker-seek ${canSeek ? 'speaker-seek--direct' : 'speaker-seek--passive'}${dragging ? ' is-dragging' : ''}`}>
      {canSeek ? (
        <input
          type='range'
          aria-label='Track position'
          min={0}
          max={duration}
          step={1}
          value={value}
          disabled={disabled || busy}
          aria-valuetext={`${timeLabel(value)} of ${timeLabel(duration)}`}
          style={{ '--speaker-range-fill': `${(value / duration) * 100}%` } as CSSProperties}
          onPointerDown={event => {
            if (disabled || inFlight.current || gesture.current || event.button !== 0) return;
            // Handle pointer seeking ourselves: native range dragging can consume
            // vertical swipes. pan-y lets the browser take over scrolling/cancel.
            event.preventDefault();
            clearTimeout(settle.current);
            event.currentTarget.focus({ preventScroll: true });
            event.currentTarget.setPointerCapture?.(event.pointerId);
            const next = pointerPosition(event);
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, value: next };
            setDragging(true);
            setDraft(next);
          }}
          onPointerMove={event => {
            if (!gesture.current || gesture.current.id !== event.pointerId) return;
            if (vertical(event)) {
              cancel();
              return;
            }
            const next = pointerPosition(event);
            gesture.current.value = next;
            setDraft(next);
          }}
          onPointerUp={event => {
            if (!gesture.current || gesture.current.id !== event.pointerId) return;
            if (vertical(event)) {
              cancel();
              return;
            }
            const next = pointerPosition(event);
            gesture.current = null;
            setDragging(false);
            void commit(next);
          }}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onBlur={cancel}
          onKeyDown={event => {
            if (event.key === 'Escape') cancel();
          }}
          onChange={event => {
            if (!gesture.current) void commit(event.currentTarget.valueAsNumber);
          }}
        />
      ) : (
        <progress aria-label='Track position' max={duration} value={position} />
      )}
      <div className='speaker-track-time' aria-hidden='true'>
        <span>{timeLabel(value)}</span>
        <span>{timeLabel(duration)}</span>
      </div>
      {error && (
        <p className='speaker-command-error' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

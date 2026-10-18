import { useLayoutEffect, useId, useRef } from 'react';
import { useSpotifyTrackSaved } from '../useSpotifyTrackSaved';
import { animateTrackHeart } from './trackHeartAnimation';

export function CanvasTrackHeart({ trackUri, title, enabled }: { trackUri?: string; title: string; enabled: boolean }) {
  const { saved, loading, pending, error, setSaved, retry } = useSpotifyTrackSaved(trackUri, enabled);
  const button = useRef<HTMLButtonElement>(null);
  const cancel = useRef<(() => void) | undefined>(undefined);
  const generation = useRef({ active: false });
  const feedbackId = useId();
  useLayoutEffect(() => {
    const current = { active: true };
    generation.current = current;
    return () => {
      current.active = false;
      cancel.current?.();
      cancel.current = undefined;
    };
  }, [trackUri, enabled]);
  async function toggle() {
    if (pending || loading) return;
    if (error) {
      retry();
      return;
    }
    if (saved === null) return;
    const desired = !saved;
    const captured = generation.current;
    if (await setSaved(desired)) {
      if (!captured.active || captured !== generation.current || !button.current) return;
      cancel.current?.();
      cancel.current = animateTrackHeart(button.current, desired);
    }
  }
  const label = loading
    ? 'Checking song saved state'
    : error
      ? 'Retry song saved state'
      : saved === null
        ? 'Liked Songs unavailable for this source'
        : saved
          ? `Remove ${title} from Liked Songs`
          : `Save ${title} to Liked Songs`;
  return (
    <span className='canvas-music__track-heart-slot canvas-track-heart' data-error={!!error}>
      <button
        ref={button}
        type='button'
        className='canvas-track-heart__button'
        aria-label={label}
        title={error ?? label}
        aria-pressed={saved ?? undefined}
        aria-busy={loading || pending}
        aria-disabled={pending || undefined}
        disabled={!enabled || !trackUri || (saved === null && !error)}
        aria-describedby={error ? feedbackId : undefined}
        onClick={() => void toggle()}
      >
        <svg
          data-heart-icon
          viewBox='0 0 24 24'
          width='22'
          height='22'
          aria-hidden='true'
          fill={saved ? 'currentColor' : 'none'}
          stroke='currentColor'
          strokeWidth='1.7'
          strokeLinecap='round'
          strokeLinejoin='round'
        >
          <path d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z' />
        </svg>
        {saved === null && (
          <span className='canvas-track-heart__badge' aria-hidden='true'>
            {loading ? '…' : error ? '!' : '?'}
          </span>
        )}
        <span data-heart-decoration className='canvas-track-heart__decoration' aria-hidden='true' />
      </button>
      {error && (
        <span className='canvas-track-heart__feedback' role='alert' id={feedbackId}>
          {error} Tap heart to retry.
        </span>
      )}
    </span>
  );
}

import { useEffect, useRef } from 'react';
import type { useCanvasModes } from './useCanvasModes';

type Modes = ReturnType<typeof useCanvasModes>;
export function CanvasModes({ modes }: { modes: Modes }) {
  return (
    <div className='canvas-modes' role='group' aria-label='Home modes'>
      {modes.map(mode => (
        <button
          key={mode.label}
          type='button'
          aria-label={`${mode.label} mode`}
          aria-pressed={mode.state === 'on'}
          disabled={mode.disabled}
          onClick={mode.activate}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
function ModeFeedback({ mode }: { mode: Modes[number] }) {
  const item = useRef<HTMLDivElement>(null);
  const phase = mode.feedback?.phase;
  const visible = phase && phase !== 'observed';
  useEffect(() => {
    // Reveal new feedback within the pulse strip without moving the page.
    if (visible && item.current?.parentElement) item.current.parentElement.scrollLeft = 0;
  }, [phase, visible]);
  if (!visible) return null;
  const failure = phase === 'failed' || phase === 'unconfirmed';
  return (
    <div ref={item} className='canvas-modes__feedback'>
      <span role={failure ? 'alert' : 'status'} title={mode.feedback?.message}>
        {mode.label}:{' '}
        {phase === 'failed'
          ? 'failed. Try again.'
          : phase === 'unconfirmed'
            ? 'not confirmed. Check state.'
            : phase === 'accepted'
              ? 'waiting for state…'
              : 'sending…'}
        {failure && <span className='canvas-modes__detail'> {mode.feedback?.message}</span>}
      </span>
      {failure && (
        <button type='button' aria-label={`Dismiss ${mode.label} mode message`} onClick={mode.dismiss}>
          ×
        </button>
      )}
    </div>
  );
}
export function CanvasModeFeedback({ modes }: { modes: Modes }) {
  return (
    <>
      {modes.map(mode => (
        <ModeFeedback key={mode.label} mode={mode} />
      ))}
    </>
  );
}

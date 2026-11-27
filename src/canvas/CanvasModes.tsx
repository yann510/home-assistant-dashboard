import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import './canvas-controls-motion.css';
import { hasVisibleModeFeedback, type useCanvasModes } from './useCanvasModes';
import type { ReportOverviewNotice } from './CanvasOverviewNotice';

type Modes = ReturnType<typeof useCanvasModes>;
type Mode = Modes[number];

export function CanvasModes({ modes }: { modes: Modes }) {
  const selected = modes.findIndex(mode => mode.state === 'on');
  const singleSelected = modes.filter(mode => mode.state === 'on').length === 1;
  return (
    <div
      className='canvas-modes'
      role='group'
      aria-label='Home modes'
      tabIndex={-1}
      data-single-selected={singleSelected}
      style={{ '--mode-index': Math.max(0, selected), '--mode-count': modes.length } as CSSProperties}
    >
      {modes.map(mode => (
        <button
          key={mode.label}
          type='button'
          aria-label={`${mode.label} mode`}
          aria-pressed={mode.state === 'on'}
          disabled={mode.disabled}
          title={mode.disabledReason}
          onClick={mode.activate}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
function ModeFeedback({ mode, pendingOnly }: { mode: Mode; pendingOnly: boolean }) {
  const item = useRef<HTMLDivElement>(null);
  const phase = mode.feedback?.phase;
  const visible = pendingOnly ? phase === 'pending' : hasVisibleModeFeedback(mode);
  useEffect(() => {
    // Reveal new feedback within the pulse strip without moving the page.
    if (visible && item.current?.parentElement) item.current.parentElement.scrollLeft = 0;
  }, [phase, visible]);
  if (!visible) return null;
  const failure = phase === 'failed' || phase === 'unconfirmed';
  return (
    <div ref={item} className='canvas-modes__feedback'>
      <span role={failure ? 'alert' : 'status'} title={mode.feedback?.message}>
        {mode.label}: {phase === 'failed' ? 'failed. Try again.' : phase === 'unconfirmed' || mode.recoveryRequired ? 'not confirmed. Check state.' : 'sending…'}
        {failure && <span className='canvas-modes__detail'> {mode.feedback?.message}</span>}
      </span>
      {mode.recoveryRequired && (
        <button type='button' className='canvas-modes__check' aria-label={`Check ${mode.label} mode status`} disabled={mode.checkDisabled} onClick={mode.checkStatus}>
          {mode.checking ? 'Checking…' : 'Check status'}
        </button>
      )}
      {failure && !mode.restorationPending && (
        <button type='button' aria-label={`Dismiss ${mode.label} mode message`} onClick={mode.dismiss}>
          ×
        </button>
      )}
    </div>
  );
}
export function CanvasModeFeedback({ modes, pendingOnly = false }: { modes: Modes; pendingOnly?: boolean }) {
  return (
    <>
      {modes.map(mode => (
        <ModeFeedback key={mode.mode} mode={mode} pendingOnly={pendingOnly} />
      ))}
    </>
  );
}

function modeIssue(feedback: Mode['feedback'] | undefined, recoveryRequired: boolean, label: string, restorationPending: boolean) {
  if (restorationPending) {
    return {
      title: `${label} mode restoration pending`,
      message: feedback?.message ?? 'Check status so Home Assistant can show the restoration in House Mood.',
    };
  }
  if (recoveryRequired || feedback?.phase === 'unconfirmed') {
    return {
      title: `${label} mode change unconfirmed`,
      message: feedback?.message ?? 'Check the current state before sending another mode command.',
    };
  }
  if (feedback?.phase === 'failed') {
    return { title: `Could not set ${label} mode`, message: feedback.message ?? 'Mode request failed. Try again.' };
  }
  return null;
}

function ModeNotice({ mode, reportNotice }: { mode: Mode; reportNotice: ReportOverviewNotice }) {
  const { mode: value, label, feedback, recoveryRequired, restorationPending } = mode;
  const id = `mode:${value}`;
  // A read-only check or message dismissal updates the open dialog. The unresolved notice keeps its place.
  const reportedFeedback = recoveryRequired ? undefined : feedback;
  useLayoutEffect(() => {
    const issue = modeIssue(reportedFeedback, recoveryRequired, label, restorationPending);
    if (!issue) return;
    reportNotice(id, { ...issue, category: 'Home modes', route: { kind: 'mode-alert', mode: value } });
    return () => reportNotice(id, null);
  }, [id, value, label, reportedFeedback, recoveryRequired, restorationPending, reportNotice]);
  return null;
}

export function CanvasModeNotices({ modes, reportNotice }: { modes: Modes; reportNotice: ReportOverviewNotice }) {
  return modes.map(mode => <ModeNotice key={mode.mode} mode={mode} reportNotice={reportNotice} />);
}

export function CanvasModeAlert({ mode }: { mode: Mode }) {
  const { feedback, label, recoveryRequired, restorationPending } = mode;
  const issue = modeIssue(feedback, recoveryRequired, label, restorationPending);
  const phase = feedback?.phase;
  const message = useRef<HTMLParagraphElement>(null);
  const lastPhase = useRef(phase);
  useLayoutEffect(() => {
    if (lastPhase.current !== phase && document.activeElement === document.body) message.current?.focus({ preventScroll: true });
    lastPhase.current = phase;
  }, [phase]);
  return (
    <section className='canvas-mode-alert'>
      <p ref={message} tabIndex={-1} role={issue ? 'alert' : 'status'}>
        {issue?.message ?? (phase === 'pending' ? `Sending ${label} mode…` : `${label} mode alert has cleared.`)}
      </p>
      {issue && (
        <div className='canvas-mode-alert__actions'>
          {recoveryRequired ? (
            <button
              type='button'
              aria-label={`Check ${label} mode status`}
              aria-disabled={mode.checkDisabled}
              onClick={() => { if (!mode.checkDisabled) mode.checkStatus(); }}
            >
              {mode.checking ? 'Checking…' : 'Check status'}
            </button>
          ) : phase === 'failed' && (
            <button type='button' disabled={mode.disabled} onClick={mode.activate}>
              Retry {label} mode
            </button>
          )}
          {!restorationPending && (phase === 'failed' || phase === 'unconfirmed') && (
            <button type='button' aria-label={`Dismiss ${label} mode message`} onClick={mode.dismiss}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </section>
  );
}

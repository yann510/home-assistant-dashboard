import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFeatureMotion } from './useFeatureMotion';
import './canvas-feature-motion.css';
import type { HouseMoodCardProps, MoodId } from '../moodTypes';
import { attentionExplanation, type AttentionItem } from '../attention';
import type { ReportOverviewNotice } from './CanvasOverviewNotice';

const moods: { id: MoodId; name: string; colour: string; caption: string }[] = [
  { id: 'love', name: 'Love', colour: '#efa5a5', caption: 'A little closer.' },
  { id: 'unwind', name: 'Chill', colour: '#cbb5ed', caption: 'Let the day drift away.' },
  { id: 'dinner', name: 'Dinner', colour: '#efbe83', caption: 'Good food. Better company.' },
  { id: 'party', name: 'Party', colour: '#c5d68c', caption: 'Turn a little louder.' },
  { id: 'gym', name: 'Gym', colour: '#9ccfd1', caption: 'Find your rhythm.' },
];

function MoodArt({ id }: { id: MoodId | null }) {
  return (
    <svg className='canvas-mood__art' viewBox='0 0 320 260' fill='none' stroke='currentColor' strokeWidth='18' aria-hidden='true'>
      <g className='canvas-mood__art-entrance'>
        <g className='canvas-mood__art-motion'>
          {id === 'love' ? (
            <path d='M160 214C130 180 40 135 40 76a62 62 0 01120-17 62 62 0 01120 17c0 59-90 104-120 138z' />
          ) : id === 'unwind' ? (
            <g strokeLinecap='round'>
              <path d='M24 80C58 50 92 50 126 80S194 110 228 80S280 50 296 65' />
              <path d='M24 130C58 100 92 100 126 130S194 160 228 130S280 100 296 115' />
              <path d='M24 180C58 150 92 150 126 180S194 210 228 180S280 150 296 165' />
            </g>
          ) : id === 'dinner' ? (
            <>
              <g className='canvas-mood__dinner-plate'>
                <circle cx='160' cy='130' r='91' />
                <circle className='canvas-mood__dinner-ripple' cx='160' cy='130' r='59' />
              </g>
              <path className='canvas-mood__dinner-fork' d='M34 40v190M16 40v50h36V40' />
              <path className='canvas-mood__dinner-knife' d='M287 40v190' />
            </>
          ) : id === 'party' ? (
            <path d='M160 12l23 64 64-31-31 64 65 23-65 23 31 64-64-31-23 64-23-64-64 31 31-64-65-23 65-23-31-64 64 31z' />
          ) : id === 'gym' ? (
            <>
              <path className='canvas-mood__gym-drive' d='M58 217L146 38h76l-88 179z' />
              <path className='canvas-mood__gym-drive' d='M160 217l88-179' />
            </>
          ) : (
            <>
              <path d='M0 170C70 170 80 20 160 20S240 170 320 170' />
              <path d='M0 205C70 205 80 55 160 55S240 205 320 205' />
              <path d='M0 240C70 240 80 90 160 90S240 240 320 240' />
            </>
          )}
        </g>
      </g>
    </svg>
  );
}

function MoodErrors({ errors }: { errors: HouseMoodCardProps['status']['errors'] }) {
  return errors.length > 0 && (
    <div role='alert' className='canvas-mood__error'>
      {errors.map((error, index) => <p key={`${error.target}-${index}`}>{error.message}</p>)}
    </div>
  );
}

function MoodRecoveryAction({ controller }: { controller: HouseMoodCardProps }) {
  const { status, connected, available, canCheckStatus, checkingStatus, onCheckStatus, onRetry } = controller;
  if (canCheckStatus) {
    return (
      <button type='button' disabled={!connected || checkingStatus} onClick={() => void onCheckStatus?.()}>
        {checkingStatus ? 'Checking status…' : 'Check status'}
      </button>
    );
  }
  if (status.phase === 'recovery_required') {
    return (
      <button type='button' disabled={!connected || !available} onClick={onRetry}>
        Retry restoration
      </button>
    );
  }
  return null;
}

const uncertainMessage = 'Check the current mood status in Home Assistant.';
const recoveryMessage = 'Some settings still need to be restored.';

export function CanvasMoodAlert({ controller }: { controller: HouseMoodCardProps }) {
  const { status, canCheckStatus } = controller;
  const recovery = status.phase === 'recovery_required';
  const hasAction = Boolean(canCheckStatus || recovery);
  const previousAction = useRef(hasAction);
  const detailsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (previousAction.current && !hasAction && document.activeElement === document.body) {
      detailsRef.current?.focus({ preventScroll: true });
    }
    previousAction.current = hasAction;
  }, [hasAction]);
  const message = canCheckStatus ? uncertainMessage
    : recovery ? recoveryMessage
    : status.phase === 'restoring' ? 'Restoring previous settings…'
    : status.phase === 'starting' ? 'Starting mood…'
    : 'This House Mood alert has cleared.';
  return (
    <section className='canvas-mood-alert' ref={detailsRef} tabIndex={-1}>
      <MoodErrors errors={status.errors} />
      {!status.errors.length && <p role='status'>{message}</p>}
      <MoodRecoveryAction controller={controller} />
    </section>
  );
}

export function CanvasMood({
  controller,
  attention,
  attentionBusy = false,
  onAttentionAction,
  reportNotice,
}: {
  controller: HouseMoodCardProps;
  attention?: AttentionItem | null;
  attentionBusy?: boolean;
  onAttentionAction?: (item: AttentionItem) => void;
  reportNotice?: ReportOverviewNotice;
}) {
  const { status, connected, available, canCheckStatus, onActivate, onEnd } = controller;
  const busy = status.phase === 'starting' || status.phase === 'restoring';
  const recovery = status.phase === 'recovery_required';
  const noticeTitle = canCheckStatus ? 'Mood change unconfirmed'
    : recovery ? 'Mood restoration needs attention'
    : status.errors.length ? 'House Mood needs attention'
    : null;
  const noticeMessage = status.errors.map(error => error.message).join('\n') || (canCheckStatus ? uncertainMessage : recoveryMessage);
  useLayoutEffect(() => {
    if (!reportNotice || !noticeTitle) return;
    const id = 'mood:status';
    reportNotice(id, { category: 'House Mood', title: noticeTitle, message: noticeMessage, route: { kind: 'mood-alert' } });
    return () => reportNotice(id, null);
  }, [reportNotice, noticeTitle, noticeMessage]);
  // A requested mood is not yet a reported result. Restoration returns to neutral.
  const confirmedMood = status.phase === 'active' || status.phase === 'starting' ? status.activeMood : null;
  const current = moods.find(mood => mood.id === confirmedMood);
  const { revision, animate } = useFeatureMotion(confirmedMood);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  const activeMotion = status.phase === 'active' && Boolean(current) && connected && available;
  const locked = !connected || !available || busy || recovery || canCheckStatus;
  const message = !connected
    ? 'Reconnecting to Home Assistant…'
    : !available
      ? 'House moods are unavailable.'
      : reportNotice && noticeTitle
        ? null
        : status.phase === 'starting'
        ? 'Starting mood…'
        : status.phase === 'restoring'
          ? 'Restoring previous settings…'
          : recovery
            ? 'Restoration needs attention.'
            : null;
  return (
    <section
      data-mood={current?.id ?? 'neutral'}
      data-feature-motion={animate}
      data-active-motion={activeMotion}
      data-page-visible={pageVisible}
      className='canvas-mood'
      style={{ background: current?.colour ?? '#cbb5ed' }}
      aria-label='House Mood'
      tabIndex={-1}
    >
      <div className='canvas-mood__copy'>
        <span className='canvas__eyebrow'>The feeling of home</span>
        <h2>
          <span key={revision} className='canvas-mood__title-motion'>
            {current?.name ?? 'Just be.'}
          </span>
        </h2>
        <p role={message ? 'status' : undefined}>{message ?? current?.caption ?? 'Your space. Your own pace.'}</p>
        {!reportNotice && <MoodErrors errors={status.errors} />}
        {attention && (
          <div className='canvas-mood__attention'>
            <strong>{attention.title}</strong>
            <p>{attention.detail}</p>
            <p>{attentionExplanation(attention)}</p>
            <button type='button' disabled={attentionBusy || !onAttentionAction} onClick={() => onAttentionAction?.(attention)}>
              {attention.kind === 'completion' ? 'Done' : 'Snooze reminder'}
            </button>
          </div>
        )}
        <div className='canvas-mood__actions'>
          {canCheckStatus || recovery ? (
            !reportNotice && <MoodRecoveryAction controller={controller} />
          ) : (
            status.activeMood && (
              <button type='button' disabled={!connected || !available || busy} onClick={onEnd}>
                End mood
              </button>
            )
          )}
        </div>
      </div>
      <MoodArt key={revision} id={current?.id ?? null} />
      <div className='canvas-mood__picker' role='group' aria-label='Choose a house mood'>
        {moods.map(mood => (
          <button
            key={mood.id}
            type='button'
            aria-label={`${mood.name} mood`}
            aria-pressed={status.activeMood === mood.id}
            disabled={locked || status.activeMood === mood.id}
            onClick={() => onActivate(mood.id)}
          >
            {mood.name}
          </button>
        ))}
      </div>
    </section>
  );
}

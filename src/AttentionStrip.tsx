import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApplianceIcon } from './ApplianceIcon';
import { attentionAge, attentionExplanation, type AttentionAction, type AttentionItem, type AttentionTargetName } from './attention';
import './attention.css';

function AttentionIcon({ item }: { item: AttentionItem }) {
  if (item.icon === 'washer' || item.icon === 'dryer' || item.icon === 'dishwasher') return <ApplianceIcon kind={item.icon} state='idle' />;
  return (
    <svg
      viewBox='0 0 32 32'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.7'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      {item.icon === 'bin' ? (
        <path d='M7 9h18M12 9V5h8v4M9 9l1 18h12l1-18M14 13v9m4-9v9' />
      ) : item.icon === 'battery' ? (
        <>
          <rect x='4' y='9' width='23' height='14' rx='3' />
          <path d='M29 14v4M9 13v6' />
        </>
      ) : item.icon === 'heat' ? (
        <>
          <rect x='5' y='12' width='22' height='15' rx='3' />
          <path d='M10 17v5m6-5v5m6-5v5M10 7h12' />
        </>
      ) : item.icon === 'connection' ? (
        <>
          <path d='M4 12c7-7 17-7 24 0M9 17c4-4 10-4 14 0M13 22c2-2 4-2 6 0M16 26h.01' />
        </>
      ) : (
        <>
          <path d='M16 4 29 27H3Z' />
          <path d='M16 12v7m0 4v.1' />
        </>
      )}
    </svg>
  );
}
function scrollTo(element: HTMLElement | null, quiet = false) {
  if (!element) return;
  const reduced = quiet || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
  element.focus({ preventScroll: true });
}
function returnToAttention() {
  scrollTo(document.getElementById('attention-strip'));
}
export function AttentionTarget({
  name,
  selected,
  onClose,
  children,
  night = false,
}: {
  name: AttentionTargetName;
  selected: AttentionItem | null;
  onClose: () => void;
  children: ReactNode;
  night?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = selected?.target === name;
  useEffect(() => {
    if (active) scrollTo(ref.current, night);
  }, [active, selected, night]);
  return (
    <div
      id={`attention-target-${name}`}
      ref={ref}
      tabIndex={-1}
      className={`attention-destination ${active ? 'attention-destination-selected' : ''}`}
    >
      {active && selected && (
        <div className='attention-context'>
          <strong>{selected.title}</strong>
          <p>{attentionExplanation(selected)}</p>
          <button
            type='button'
            onClick={() => {
              onClose();
              returnToAttention();
            }}
          >
            Back to reminders
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
export type AttentionStripProps = {
  compact?: boolean;
  items: AttentionItem[];
  connected: boolean;
  ready: boolean;
  disconnected: boolean;
  night: boolean;
  now: number;
  busy: boolean;
  error: string | null;
  onAction: (action: AttentionAction, item: AttentionItem) => void;
  onView: (item: AttentionItem) => void;
  selected?: AttentionItem | null;
  onClose?: () => void;
};
export function AttentionStrip({
  compact = false,
  items,
  connected,
  ready,
  disconnected,
  night,
  now,
  busy,
  error,
  onAction,
  onView,
  selected,
  onClose,
}: AttentionStripProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const signature = JSON.stringify(items.map(i => i.episode));
  const [visibility, setVisibility] = useState(document.visibilityState);
  const [entrance, setEntrance] = useState(() => ({
    signature,
    connected,
    ready,
    visibility,
    seen: new Set(items.map(i => i.episode)),
    fresh: [] as string[],
    until: 0,
  }));
  if (
    signature !== entrance.signature ||
    connected !== entrance.connected ||
    ready !== entrance.ready ||
    visibility !== entrance.visibility
  ) {
    const animate =
      ready && entrance.ready && connected && entrance.connected && visibility === 'visible' && entrance.visibility === 'visible' && !night;
    const added = items.filter(i => !entrance.seen.has(i.episode));
    setEntrance({
      signature,
      connected,
      ready,
      visibility,
      seen: new Set([...entrance.seen, ...items.map(i => i.episode)].slice(-1000)),
      fresh: animate ? added.map(i => i.episode) : [],
      until: now + 1000,
    });
  }
  useEffect(() => {
    const update = () => setVisibility(document.visibilityState);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const fresh = new Set(now < entrance.until ? entrance.fresh : []);
  const visible = items.filter(i => !i.snoozed_until || Date.parse(i.snoozed_until) <= now);
  const snoozed = items.filter(i => i.snoozed_until && Date.parse(i.snoozed_until) > now);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected?.target === 'details') scrollTo(detailRef.current, night);
  }, [selected, night]);
  const localDetails = selected?.target === 'details';
  if (disconnected)
    return (
      <section id='attention-strip' tabIndex={-1} className='attention-strip attention-connection' aria-label='Dashboard connection'>
        <span className='attention-connection-dot' />
        <div>
          <strong>Reconnecting to Home Assistant…</strong>
          <p>Live status paused. Your saved reminders will return.</p>
        </div>
      </section>
    );
  if (!ready && connected)
    return (
      <section id='attention-strip' tabIndex={-1} className='attention-strip attention-connection' aria-label='Attention status'>
        <div>
          <strong>Attention reminders are unavailable.</strong>
          <p>Waiting for Home Assistant’s attention service.</p>
        </div>
      </section>
    );
  if (!visible.length && !snoozed.length && !error) return null;
  return (
    <section id='attention-strip' tabIndex={-1} className={`attention-strip ${night ? 'attention-quiet' : ''}`} aria-label='Home reminders'>
      {visible.length > 0 && (
        <>
          <header>
            <h2>
              Needs attention <span>{visible.length}</span>
            </h2>
            <span className='attention-quiet-label'>{connected ? 'A few things for you' : 'Live status paused'}</span>
          </header>
          <ul>
            {(expanded ? visible : visible.slice(0, 2)).map(item => (
              <li
                key={item.episode}
                className={`attention-notice attention-${item.tone} ${fresh.has(item.episode) ? 'attention-new' : ''}`}
              >
                <span className='attention-icon'>
                  <AttentionIcon item={item} />
                  {item.kind === 'completion' && <b aria-hidden='true'>✓</b>}
                </span>
                <div className='attention-copy'>
                  <strong>{item.title}</strong>
                  <span>
                    {item.kind === 'completion' ? `${attentionAge(item.occurred_at, now)}${compact ? '' : ' · '}` : ''}
                    {(!compact || item.kind !== 'completion') && item.detail}
                  </span>
                </div>
                <div className='attention-actions'>
                  {item.kind === 'completion' ? (
                    <button
                      type='button'
                      aria-label={`Done: ${item.title}`}
                      disabled={busy || !connected}
                      onClick={() => onAction('dismiss', item)}
                    >
                      Done
                    </button>
                  ) : (
                    <>
                      <button type='button' aria-label={`View: ${item.title}`} onClick={() => onView({ ...item })}>
                        View
                      </button>
                      <button
                        type='button'
                        className='attention-snooze-action'
                        aria-label={`Snooze: ${item.title}`}
                        disabled={busy || !connected}
                        onClick={() => onAction('snooze', item)}
                      >
                        Snooze
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {visible.length > 2 && (
            <button type='button' className='attention-expand' aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : `View all (${visible.length})`} <span aria-hidden='true'>{expanded ? '⌃' : '⌄'}</span>
            </button>
          )}
        </>
      )}
      {snoozed.length > 0 && (
        <>
          <button type='button' className='attention-expand' aria-expanded={showSnoozed} onClick={() => setShowSnoozed(!showSnoozed)}>
            Snoozed · {snoozed.length}
          </button>
          {showSnoozed && (
            <ul>
              {snoozed.map(item => (
                <li key={item.episode} className='attention-notice'>
                  <div className='attention-copy'>
                    <strong>{item.title}</strong>
                    <span>Returns in {Math.max(1, Math.ceil((Date.parse(item.snoozed_until!) - now) / 60000))} min</span>
                  </div>
                  <button
                    type='button'
                    aria-label={`Restore: ${item.title}`}
                    disabled={busy || !connected}
                    onClick={() => onAction('unsnooze', item)}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <p className='attention-error' role='alert'>
          {error}
        </p>
      )}
      {busy && (
        <p className='attention-pending' role='status'>
          Saving reminder…
        </p>
      )}
      <span className='attention-sr-only' aria-live='polite' aria-atomic='true'>
        {fresh.size
          ? items
              .filter(i => fresh.has(i.episode))
              .map(i => i.title)
              .join('. ')
          : ''}
      </span>
      {localDetails && selected && (
        <div ref={detailRef} tabIndex={-1} className='attention-inline-detail'>
          <strong>{selected.title}</strong>
          <p>{attentionExplanation(selected)}</p>
          <button type='button' onClick={onClose}>
            Close details
          </button>
        </div>
      )}
    </section>
  );
}

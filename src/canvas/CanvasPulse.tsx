import { useState, type ReactNode } from 'react';
import { useStore } from '@hakit/core';
import { ApplianceIcon } from '../ApplianceIcon';
import { useApplianceClock } from '../useApplianceClock';
import type { AttentionItem } from '../attention';
import type { useAttention } from '../useAttention';
import { applianceSensors, classifyAppliance, classifyVacuum } from './activity';
import { routeForAttention, type CanvasRoute } from './routes';
import './canvas-pulse.css';

export type QuietPulsePresentation = 'current' | 'art' | 'hidden';

export type AttentionController = ReturnType<typeof useAttention>;

export function CanvasPulse({
  onOpen,
  attention,
  onSelect,
  feedback,
  quietPresentation = 'hidden',
}: {
  onOpen(route: CanvasRoute, trigger: HTMLElement): void;
  attention: AttentionController;
  feedback?: ReactNode;
  quietPresentation?: QuietPulsePresentation;
  onSelect(item: AttentionItem | null): void;
}) {
  const entities = useStore(state => state.entities);
  const now = useApplianceClock();
  const [showSnoozed, setShowSnoozed] = useState(false);
  const activities = applianceSensors.map(appliance => {
    const machine = entities[`${appliance.prefix}_machine_state`]?.state;
    const status = classifyAppliance(
      appliance.id,
      entities[`${appliance.prefix}_machine_state`]?.state,
      entities[`${appliance.prefix}_job_state`]?.state,
      entities[`${appliance.prefix}_completion_time`]?.state,
      now,
      attention.connected
    );
    return { ...appliance, ...status, reported: machine !== undefined, route: { kind: 'appliances' } as CanvasRoute };
  });
  const vacuum = classifyVacuum(entities['vacuum.roomba']?.state, attention.connected);
  const shownActivities: {
    id: string;
    name: string;
    status: string;
    active: boolean;
    iconState: 'running' | 'paused' | 'idle' | 'unavailable' | 'unknown';
    route: CanvasRoute;
  }[] = activities.filter(
    activity =>
      activity.active ||
      activity.status === 'Paused' ||
      activity.status === 'Finished' ||
      (activity.reported && ['Unavailable', 'Unknown'].includes(activity.status))
  );
  if (entities['vacuum.roomba'] && vacuum.status !== 'Docked')
    shownActivities.push({ id: 'roomba', name: 'Roomba', ...vacuum, route: { kind: 'vacuum' } });
  const visible = attention.ready
    ? attention.items.filter(item => !item.snoozed_until || Date.parse(item.snoozed_until) <= attention.now)
    : [];
  const snoozed = attention.ready
    ? attention.items.filter(item => item.snoozed_until && Date.parse(item.snoozed_until) > attention.now)
    : [];
  const missingStatus = activities.some(activity => !activity.reported) || !entities['vacuum.roomba'];

  const quiet =
    attention.connected &&
    attention.ready &&
    !attention.error &&
    !attention.busy &&
    !missingStatus &&
    !shownActivities.length &&
    !visible.length &&
    !snoozed.length &&
    !feedback;

  if (quiet && quietPresentation === 'hidden') return null;
  if (quiet && quietPresentation === 'art')
    return (
      <section className='canvas-pulse canvas-pulse--quiet-art' aria-label='House pulse'>
        <div className='canvas-pulse__quiet-copy'>
          <span>House pulse</span>
          <p>All quiet at home.</p>
        </div>
        <QuietLandscape />
        <QuietLandscape compact />
      </section>
    );

  return (
    <section className='canvas-pulse' aria-label='House pulse'>
      <span className='canvas-pulse__heading'>
        <svg className='canvas-pulse__signature' viewBox='0 0 40 40' fill='none' aria-hidden='true'>
          <path
            d='M20 3v8m0 18v8M3 20h8m18 0h8M8 8l6 6m12 12 6 6M8 32l6-6m12-12 6-6'
            stroke='currentColor'
            strokeWidth='2.5'
            strokeLinecap='round'
          />
          <circle cx='20' cy='20' r='6' fill='currentColor' />
        </svg>
        <span>
          House
          <br />
          pulse
        </span>
      </span>
      {!attention.connected ? (
        <p role='status'>Live activity unavailable while disconnected.</p>
      ) : (
        <>
          <div className='canvas-pulse__items'>
            {feedback}
            {shownActivities.map(item => (
              <button
                key={item.id}
                type='button'
                className={`canvas-pulse__activity${item.active ? ' appliance-animation' : ''}`}
                data-device={item.id}
                data-state={item.iconState}
                aria-label={`${item.name} ${item.status}`}
                onClick={event => {
                  onSelect(null);
                  onOpen(item.route, event.currentTarget);
                }}
              >
                <span className='canvas-pulse__art' aria-hidden='true'>
                  {item.id === 'roomba' ? (
                    <svg className='canvas-pulse__roomba' viewBox='0 0 36 36' fill='none' stroke='currentColor' strokeWidth='1.6'>
                      <circle cx='18' cy='18' r='13' />
                      <path d='M8 13a11 11 0 0 1 20 0M12 27h12' strokeLinecap='round' />
                      <circle cx='18' cy='17' r='4' />
                      <circle cx='18' cy='9' r='1' fill='currentColor' stroke='none' />
                      <path className='canvas-pulse__brush' d='m7 27-3 3m1-5-2 1m7 3-1 3' strokeLinecap='round' />
                    </svg>
                  ) : (
                    <ApplianceIcon kind={item.id as 'washer' | 'dryer' | 'dishwasher'} state={item.iconState} />
                  )}
                </span>
                <span className='canvas-pulse__copy'>
                  <strong>{item.name}</strong>
                  <small>{item.status}</small>
                </span>
              </button>
            ))}
            {!shownActivities.length && !visible.length && (
              <p>
                {!attention.ready
                  ? 'Reminder status unavailable.'
                  : missingStatus
                    ? 'Activity status unavailable for some devices.'
                    : 'All quiet at home.'}
              </p>
            )}
            {visible.map(item => (
              <button
                key={item.episode}
                type='button'
                className='canvas-pulse__notice'
                data-tone={item.tone}
                aria-label={`View: ${item.title}`}
                onClick={event => {
                  onSelect(item);
                  if (item.target === 'mood') {
                    const moodCard = document.querySelector<HTMLElement>('.canvas-mood');
                    moodCard?.focus({ preventScroll: true });
                    moodCard?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
                    return;
                  }
                  onOpen(routeForAttention(item), event.currentTarget);
                }}
              >
                <span className='canvas-pulse__notice-art' aria-hidden='true'>
                  <svg viewBox='0 0 32 32' fill='none'>
                    <path d='m16 2 3.4 7 7.6-2-2 7.5 5 5.5-7.5 1.5-2 7.5-5.5-5-7.5 2L9 18.4 2 15l7-3.4L8 4l7 4Z' fill='currentColor' />
                    {item.tone === 'blue' ? (
                      <circle cx='16' cy='16' r='3' fill='var(--canvas-bg)' />
                    ) : (
                      <path d='M16 10v7m0 4v.1' stroke='var(--canvas-bg)' strokeWidth='2' strokeLinecap='round' />
                    )}
                  </svg>
                </span>
                <span className='canvas-pulse__copy'>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <span className='canvas-pulse__arrow' aria-hidden='true'>
                  ↗
                </span>
              </button>
            ))}
            {snoozed.length > 0 && (
              <>
                <button type='button' aria-expanded={showSnoozed} onClick={() => setShowSnoozed(!showSnoozed)}>
                  Snoozed · {snoozed.length}
                </button>
                {showSnoozed &&
                  snoozed.map(item => (
                    <button
                      key={item.episode}
                      type='button'
                      disabled={!attention.connected || attention.busy || !attention.ready}
                      aria-label={`Restore: ${item.title}`}
                      onClick={() => void attention.onAction('unsnooze', item)}
                    >
                      Restore {item.title}
                    </button>
                  ))}
              </>
            )}
          </div>
          {!attention.ready && <p role='status'>Attention reminders are unavailable.</p>}
          {attention.error && (
            <p role='alert' className='canvas-pulse__error'>
              {attention.error}
            </p>
          )}
          {attention.busy && <p role='status'>Saving reminder…</p>}
        </>
      )}
    </section>
  );
}

function QuietLandscape({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={`canvas-pulse__quiet-landscape${compact ? ' canvas-pulse__quiet-landscape--compact' : ''}`}
      viewBox={compact ? '195 0 270 100' : '0 0 620 100'}
      fill='none'
      aria-hidden='true'
    >
      <path d='M5 100C74 46 126 64 185 100Z' className='canvas-pulse__quiet-hill' />
      <path d='M391 100c58-68 138-77 229-18v18Z' className='canvas-pulse__quiet-hill' />
      <circle cx='442' cy='30' r='21' className='canvas-pulse__quiet-sun' />
      <g stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M138 79h357M215 78V40l40-29 40 29v38M204 48l51-37 51 37M231 78V51h18v27M265 48h15v15h-15z' />
        <path d='M297 78V48h46v30M309 58h20v10h-20M187 78V46m0 16c-18-3-20-13-15-19 12 0 17 9 15 19Zm0-9c2-15 11-22 19-17 1 12-6 17-19 17Z' />
        <path d='M379 78V51m0 11c-13-2-17-11-12-16 10 0 14 7 12 16Zm0-8c2-11 9-16 15-12 0 9-5 12-15 12Z' />
        <path d='M350 18v8m-4-4h8M123 36v6m-3-3h6M484 54v6m-3-3h6' />
      </g>
    </svg>
  );
}

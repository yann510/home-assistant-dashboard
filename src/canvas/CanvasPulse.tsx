import { useState, type ReactNode } from 'react';
import { useStore } from '@hakit/core';
import { ApplianceIcon } from '../ApplianceIcon';
import { useApplianceClock } from '../useApplianceClock';
import type { AttentionItem } from '../attention';
import type { useAttention } from '../useAttention';
import { applianceSensors, classifyAppliance, classifyVacuum } from './activity';
import { routeForAttention, type CanvasRoute } from './routes';
import './canvas-pulse.css';

export type AttentionController = ReturnType<typeof useAttention>;

export function CanvasPulse({
  onOpen,
  attention,
  onSelect,
  feedback,
}: {
  onOpen(route: CanvasRoute, trigger: HTMLElement): void;
  attention: AttentionController;
  feedback?: ReactNode;
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

  return (
    <section className='canvas-pulse' aria-label='House pulse'>
      <span className='canvas-pulse__heading'>
        <svg className='canvas-pulse__signature' viewBox='0 0 40 40' fill='none' aria-hidden='true'>
          <path d='M20 3v8m0 18v8M3 20h8m18 0h8M8 8l6 6m12 12 6 6M8 32l6-6m12-12 6-6' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' />
          <circle cx='20' cy='20' r='6' fill='currentColor' />
        </svg>
        <span>House<br />pulse</span>
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
                <span className='canvas-pulse__arrow' aria-hidden='true'>↗</span>
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

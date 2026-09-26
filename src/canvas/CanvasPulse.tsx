import { useState, type ReactNode } from 'react';
import { useStore } from '@hakit/core';
import { ApplianceIcon } from '../ApplianceIcon';
import { useApplianceClock } from '../useApplianceClock';
import type { AttentionItem } from '../attention';
import type { useAttention } from '../useAttention';
import { applianceSensors, classifyAppliance, classifyVacuum } from './activity';
import { routeForAttention, type CanvasRoute } from './routes';

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
      <span className='canvas__eyebrow canvas-pulse__heading'>
        House pulse{shownActivities.length > 0 && <small>{shownActivities.length} devices →</small>}
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
                aria-label={`${item.name} ${item.status}`}
                onClick={event => {
                  onSelect(null);
                  onOpen(item.route, event.currentTarget);
                }}
              >
                {item.id === 'roomba' ? (
                  <span aria-hidden='true'>◉</span>
                ) : (
                  <ApplianceIcon kind={item.id as 'washer' | 'dryer' | 'dishwasher'} state={item.iconState} />
                )}
                <span>
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
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <span aria-hidden='true'>→</span>
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

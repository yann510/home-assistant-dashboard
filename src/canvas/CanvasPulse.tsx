import { useState } from 'react';
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
}: {
  onOpen(route: CanvasRoute): void;
  attention: AttentionController;
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
  if (vacuum.active || vacuum.status === 'Paused' || (entities['vacuum.roomba'] && ['Unavailable', 'Unknown'].includes(vacuum.status)))
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
      <span className='canvas__eyebrow canvas-pulse__heading'>House pulse</span>
      {!attention.connected ? (
        <p role='status'>Live activity unavailable while disconnected.</p>
      ) : (
        <>
          <div className='canvas-pulse__items'>
            {shownActivities.map(item => (
              <button
                key={item.id}
                type='button'
                className={`canvas-pulse__activity${item.active ? ' appliance-animation' : ''}`}
                aria-label={`${item.name} ${item.status}`}
                onClick={() => {
                  onSelect(null);
                  onOpen(item.route);
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
              <p>{missingStatus ? 'Activity status unavailable for some devices.' : 'All quiet at home.'}</p>
            )}
            {visible.map(item => (
              <div key={item.episode} className='canvas-pulse__notice' data-tone={item.tone}>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
                {item.kind === 'completion' ? (
                  <button
                    type='button'
                    disabled={!attention.connected || attention.busy || !attention.ready}
                    aria-label={`Done: ${item.title}`}
                    onClick={() => void attention.onAction('dismiss', item)}
                  >
                    Done
                  </button>
                ) : (
                  <>
                    <button
                      type='button'
                      aria-label={`View: ${item.title}`}
                      onClick={() => {
                        onSelect(item);
                        onOpen(routeForAttention(item));
                      }}
                    >
                      View
                    </button>
                    <button
                      type='button'
                      disabled={!attention.connected || attention.busy || !attention.ready}
                      aria-label={`Snooze: ${item.title}`}
                      onClick={() => void attention.onAction('snooze', item)}
                    >
                      Snooze
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          {snoozed.length > 0 && (
            <div className='canvas-pulse__snoozed'>
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
            </div>
          )}
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

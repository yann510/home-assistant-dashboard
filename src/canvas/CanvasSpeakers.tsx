import { useEffect } from 'react';
import { SpeakerVolume } from '../SpeakerVolume';
import { speakerIds } from '../useSpeakerSession';
import { CanvasFollow } from './CanvasMusic';
import { useCanvasMusic } from './CanvasMusicProvider';

export function CanvasSpeakers() {
  const { session: s, rooms: r, disabled } = useCanvasMusic();
  const { begin, pending } = r;
  useEffect(() => {
    if (!pending.current) begin();
  }, [begin, pending]);
  return (
    <div className='canvas-speakers'>
      <CanvasFollow />
      {(r.following || r.cleanupPending) && (
        <div>
          <p>{r.following ? 'Follow me controls rooms using motion.' : 'Finish switching modes before editing rooms.'}</p>
          <button disabled={disabled || r.busy || s.busy} onClick={() => void r.perform(true)}>
            Switch to manual grouping
          </button>
        </div>
      )}
      <div className='canvas-speakers__rooms'>
        {speakerIds.map(id => {
          const entity = r.entities[id];
          const available = entity && !['unknown', 'unavailable'].includes(entity.state);
          return (
            <label key={id}>
              <input
                type='checkbox'
                checked={r.selected.includes(id)}
                disabled={r.locked || id === s.entityId || !available}
                onChange={() => r.setSelected(old => (old.includes(id) ? old.filter(value => value !== id) : [...old, id]))}
              />
              <span>
                {entity?.attributes.friendly_name ?? id.replace('media_player.', '').replace(/_/g, ' ')}
                <small>
                  {!available
                    ? 'Unavailable'
                    : id === s.entityId
                      ? 'Main speaker'
                      : r.current.includes(id)
                        ? 'In this group'
                        : 'Not grouped'}
                </small>
              </span>
            </label>
          );
        })}
      </div>
      {r.conflict && (
        <div role='alert'>
          <p>{r.conflict.message}</p>
          <button onClick={() => void r.perform(false, r.conflict!.signature)} disabled={r.locked}>
            Replace audio and apply
          </button>
        </div>
      )}
      {r.error && <p role='alert'>{r.error}</p>}
      <p role='status'>{r.status || (r.changed ? 'Room changes take effect when you apply.' : 'Choose rooms for this group.')}</p>
      <button disabled={r.locked || (!r.changed && !r.error)} onClick={() => void r.perform()}>
        {r.busy ? 'Updating…' : r.error ? 'Retry rooms' : 'Apply rooms'}
      </button>
      <section aria-label='Group volume'>
        <h3>Group volume</h3>
        <p>Volume changes take effect immediately.</p>
        <SpeakerVolume
          accessibleLabel='Group volume'
          key={s.targets.join(',')}
          entityId={s.entityId}
          targets={s.targets}
          disabled={disabled}
        />
      </section>
      <details>
        <summary>Individual speakers</summary>
        {s.targets.map(id => (
          <SpeakerVolume key={id} entityId={id} targets={[id]} disabled={disabled} room={r.entities[id]?.attributes.friendly_name ?? id} />
        ))}
      </details>
      <details>
        <summary>Advanced</summary>
        <label>
          Main speaker
          <select value={s.entityId} disabled={r.locked} onChange={event => s.setPreferredSource(event.target.value)}>
            {speakerIds.map(id => (
              <option key={id} value={id} disabled={!r.entities[id] || ['unknown', 'unavailable'].includes(r.entities[id]?.state)}>
                {r.entities[id]?.attributes.friendly_name ?? id}
              </option>
            ))}
          </select>
        </label>
        <p>The main speaker stays selected. Choosing another group uses its current audio.</p>
        <button
          disabled={r.locked}
          onClick={() =>
            r.setSelected([
              ...new Set([
                s.entityId,
                ...speakerIds.filter(id => r.entities[id] && !['unknown', 'unavailable'].includes(r.entities[id].state)),
              ]),
            ])
          }
        >
          All rooms
        </button>
        <button disabled={r.locked} onClick={() => r.setSelected([s.entityId])}>
          Only {r.name}
        </button>
        <button disabled={r.busy} onClick={r.begin}>
          Reload current rooms
        </button>
      </details>
    </div>
  );
}

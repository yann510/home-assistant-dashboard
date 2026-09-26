import { useEffect, useState } from 'react';
import { SpeakerVolume } from '../SpeakerVolume';
import { speakerIds } from '../useSpeakerSession';
import { CanvasFollow } from './CanvasMusic';
import { useCanvasMusic } from './CanvasMusicProvider';

export function CanvasSpeakers() {
  const { session: s, rooms: r, disabled } = useCanvasMusic();
  const { begin, pending } = r;
  const [sourceOpen, setSourceOpen] = useState(false);
  const hasOtherAudio = speakerIds.some(id =>
    !r.current.includes(id) && ['playing', 'buffering', 'paused'].includes(r.entities[id]?.state ?? '')
  );
  useEffect(() => {
    if (!pending.current) begin(true);
  }, [begin, pending]);
  return (
    <div className='canvas-speakers'>
      <section className='canvas-speakers__group' aria-label='Speaker rooms'>
        {hasOtherAudio && <div className='canvas-speakers__source-actions'>
          <button
            type='button'
            className='canvas-speakers__source-toggle'
            aria-expanded={sourceOpen}
            aria-controls='canvas-speakers-source'
            onClick={() => setSourceOpen(open => !open)}
          >
            {sourceOpen ? 'Done' : 'Change source'}
          </button>
        </div>}
        {hasOtherAudio && sourceOpen && (
          <label id='canvas-speakers-source' className='canvas-speakers__source'>
            <span>Use audio from</span>
            <select value={s.entityId} disabled={r.locked} onChange={event => s.setPreferredSource(event.target.value)}>
              {speakerIds.map(id => (
                <option key={id} value={id} disabled={!r.entities[id] || ['unknown', 'unavailable'].includes(r.entities[id]?.state)}>
                  {r.entities[id]?.attributes.friendly_name ?? id}
                </option>
              ))}
            </select>
          </label>
        )}
        {(r.following || r.cleanupPending) && (
          <div className='canvas-speakers__managed'>
            <p>{r.following ? 'Follow me is managing these rooms.' : 'Finish switching to manual grouping to edit rooms.'}</p>
            <button disabled={disabled || r.busy || s.busy} onClick={() => void r.perform(true)}>
              Switch to manual grouping
            </button>
          </div>
        )}
        <div className='canvas-speakers__rooms'>
          {speakerIds.map(id => {
            const entity = r.entities[id];
            const available = entity && !['unknown', 'unavailable'].includes(entity.state);
            const selected = r.current.includes(id);
            const state = !available
              ? 'Unavailable'
              : r.busyRoom === id
                ? selected ? 'Removing…' : 'Joining…'
                : id === s.entityId ? 'Main speaker' : '';
            return (
              <div key={id} className='canvas-speakers__room' data-selected={selected} aria-busy={r.busyRoom === id}>
                <label className='canvas-speakers__room-select'>
                  <input
                    type='checkbox'
                    checked={selected}
                    disabled={r.locked || (id === s.entityId && r.current.length === 1) || !available}
                    onChange={() => void r.toggleRoom(id)}
                  />
                  <span>
                    <strong>{entity?.attributes.friendly_name ?? id.replace('media_player.', '').replace(/_/g, ' ')}</strong>
                    {state && <small>{state}</small>}
                  </span>
                </label>

              </div>
            );
          })}
        </div>
        {r.conflict && (
          <div className='canvas-speakers__feedback' role='alert'>
            <p>{r.conflict.message}</p>
            <button onClick={() => void r.perform(false, r.conflict!.signature)} disabled={r.locked}>
              Replace audio
            </button>
            <button type='button' onClick={() => r.begin()} disabled={r.locked}>Cancel</button>
          </div>
        )}
        {r.error && <p role='alert'>{r.error}</p>}
        {r.status && <p className='canvas-speakers__status' role='status'>{r.status}</p>}

      </section>
      <section className='canvas-speakers__volume' aria-label='Group volume'>
        <SpeakerVolume
          accessibleLabel='Group volume'
          key={s.targets.join(',')}
          entityId={s.entityId}
          targets={s.targets}
          disabled={disabled || r.busy}
        />
      </section>
      <section className='canvas-speakers__follow' aria-label='Follow me settings'>
        <div>
          <h3>Follow me</h3>
          <p>Music follows you from room to room.</p>
        </div>
        <CanvasFollow />
      </section>
    </div>
  );
}

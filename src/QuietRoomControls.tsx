import { rooms } from './useLightSummary';
import { LightCard } from './LightCard';
import { BlindCard } from './BlindCard';

export function QuietRoomControls({ kind }: { kind: 'lights' | 'blinds' }) {
  if (kind === 'blinds')
    return (
      <>
        <p className='quiet-muted'>Room commands are sent through Google Assistant. Position feedback is not available.</p>
        <div className='quiet-blinds-grid'>
          {(['living room', 'bedroom', 'gym'] as const).map(room => (
            <BlindCard key={room} room={room} />
          ))}
        </div>
      </>
    );
  return (
    <div className='quiet-light-rooms'>
      {rooms.map(room => (
        <section className='quiet-light-room' key={room.name} aria-label={room.name}>
          <h3>{room.name}</h3>
          <div className='quiet-room-lights'>
            {room.lights.map(id => (
              <LightCard key={id} lightEntityName={id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

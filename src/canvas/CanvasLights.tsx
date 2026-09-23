import { useState } from 'react';
import { useCanvasLights, lightSupportsBrightness, type CanvasRoom } from './useCanvasLights';

function CommandFeedback() {
  const { result } = useCanvasLights();
  if (!result) return null;
  const failures = result.results.filter(item => item.phase === 'failed' || item.phase === 'unconfirmed');
  if (failures.length) return <p className='canvas-lights__error' role='alert'>{failures.map(item => `${item.target}: ${item.message}`).join(' ')}</p>;
  const pending = result.results.filter(item => item.phase === 'pending').length;
  const accepted = result.results.filter(item => item.phase === 'accepted').length;
  const observed = result.results.filter(item => item.phase === 'observed').length;
  return <p className='canvas-lights__muted' role='status'>
    {pending ? `Sending to ${pending} light${pending === 1 ? '' : 's'}…` : accepted ? `Service accepted for ${accepted} light${accepted === 1 ? '' : 's'}; waiting for reported state.` : `${observed} light${observed === 1 ? '' : 's'} reported the requested state.`}
  </p>;
}

function RoomPower({ room }: { room: CanvasRoom }) {
  const { power, busy, connected } = useCanvasLights();
  const desired = room.on > 0 ? 'off' : 'on';
  return <button type='button' className='canvas-lights__power'
    aria-label={`Turn ${desired} ${room.name} lights`}
    disabled={!connected || !room.available || room.lights.some(light => busy.has(light.id))}
    onClick={() => void power(room.lights.map(light => light.id), desired)}>
    Turn {desired}
  </button>;
}

function RoomBrightness({ room }: { room: CanvasRoom }) {
  const { brightness, busy, connected } = useCanvasLights();
  const supported = room.lights.some(light => light.state !== 'unavailable' && lightSupportsBrightness(light.entity));
  const [draft, setDraft] = useState<number | null>(null);
  const [committing, setCommitting] = useState(false);
  const commit = () => {
    if (draft === null || committing) return;
    setCommitting(true);
    void brightness(room.lights.map(light => light.id), draft).then(result => {
      if (result?.results.every(item => item.phase === 'observed')) setDraft(null);
      setCommitting(false);
    });
  };
  if (!supported) return <p className='canvas-lights__muted'>Brightness unavailable for this room.</p>;
  return <label className='canvas-lights__slider'>Brightness
    <input type='range' min='1' max='100' aria-label='Room brightness' value={draft ?? room.brightness ?? 50}
      disabled={!connected || committing || room.lights.some(light => busy.has(light.id))}
      onChange={event => setDraft(Number(event.target.value))}
      onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    <output>{draft ?? room.brightness ?? '—'}%</output>
  </label>;
}

export function CanvasLights({ onOpenAll }: { onOpenAll(): void }) {
  const { rooms, selectedRoom, setSelectedRoom } = useCanvasLights();
  const room = rooms.find(item => item.name === selectedRoom) ?? rooms[0];
  return <section className='canvas-lights canvas-lights--compact' aria-label='Lights'>
    <div className='canvas-lights__heading'><div><span className='canvas__eyebrow'>Lights</span><h2>Set the glow.</h2></div>
      <button type='button' onClick={onOpenAll}>All lights</button></div>
    <div className='canvas-lights__room-line'>
      <label>Room <select aria-label='Lights room' value={room.name} onChange={event => setSelectedRoom(event.target.value)}>
        {rooms.map(item => <option key={item.name}>{item.name}</option>)}
      </select></label>
      <RoomPower room={room} />
    </div>
    <p className='canvas-lights__muted'>{room.on} on · {room.lights.length - room.available} unavailable</p>
    <RoomBrightness key={room.name} room={room} />
    <CommandFeedback />
  </section>;
}

export function CanvasAllLights({ onOpenLight }: { onOpenLight(entityId: string): void }) {
  const { rooms, power, busy, connected } = useCanvasLights();
  const all = rooms.flatMap(room => room.lights);
  return <div className='canvas-lights canvas-lights--all'>
    <div className='canvas-lights__toolbar'><p>Choose a light for brightness and colour.</p>
      <button type='button' disabled={!connected || !all.some(light => light.state === 'on') || all.some(light => busy.has(light.id))}
        onClick={() => void power(all.map(light => light.id), 'off')}>Turn off all lights</button></div>
    <CommandFeedback />
    <div className='canvas-lights__grid'>{rooms.map(room => <section className='canvas-lights__group' key={room.name} aria-label={`${room.name} lights`}>
      <div className='canvas-lights__heading'><h3>{room.name}</h3><RoomPower room={room} /></div>
      <p className='canvas-lights__muted'>{room.on} on · {room.lights.length - room.available} unavailable</p>
      {room.lights.map(light => <div className='canvas-lights__light' key={light.id}>
        <button type='button' className='canvas-lights__detail' onClick={() => onOpenLight(light.id)}>
          <span>{light.name}</span><small>{light.state === 'unavailable' ? 'Unavailable' : light.state === 'on' ? 'On' : 'Off'}</small>
        </button>
        <button type='button' aria-label={`Turn ${light.state === 'on' ? 'off' : 'on'} ${light.name}`}
          aria-pressed={light.state === 'on'} disabled={!connected || light.state === 'unavailable' || busy.has(light.id)}
          onClick={() => void power([light.id], light.state === 'on' ? 'off' : 'on')}>
          {light.state === 'on' ? 'On' : 'Off'}
        </button>
      </div>)}</section>)}</div>
  </div>;
}

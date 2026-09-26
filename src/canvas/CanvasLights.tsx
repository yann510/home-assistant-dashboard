import { useRef, useState, type CSSProperties } from 'react';
import { CanvasRoomPicker } from './CanvasRoomPicker';
import { RoomArtwork } from './RoomArtwork';
import { getRoomAccent } from './room-artwork';
import './canvas-lights-quick.css';
import './canvas-lights-all.css';
import { useCanvasLights, lightSupportsBrightness, type CanvasRoom } from './useCanvasLights';

function quickLightName(name: string, room: string) {
  let short = name.replace(/^light[ _-]+/i, '');
  if (short.toLowerCase().startsWith(room.toLowerCase()) && /^[ _-]/.test(short.slice(room.length))) {
    short = short.slice(room.length).replace(/^[ _-]+/, '');
  }
  if (!short.trim()) short = name;
  return (short[0].toUpperCase() + short.slice(1)).replace(/\bled\b/gi, 'LED');
}

function CommandFeedback({ compact = false }: { compact?: boolean }) {
  const { result, rooms } = useCanvasLights();
  if (!result) return null;
  const failures = result.results.filter(item => item.phase === 'failed' || item.phase === 'unconfirmed');
  const pending = result.results.filter(item => item.phase === 'pending').length;
  const accepted = result.results.filter(item => item.phase === 'accepted').length;
  return (
    <>
      {failures.length > 0 && (
        <p className='canvas-lights__error' role='alert'>
          {compact
            ? `${failures.length} light${failures.length === 1 ? ' needs' : 's need'} attention. Open All lights for details.`
            : failures
                .map(
                  item => `${rooms.flatMap(room => room.lights).find(light => light.id === item.target)?.name ?? 'Light'}: ${item.message}`
                )
                .join(' ')}
        </p>
      )}
      {!compact && (pending > 0 || accepted > 0) && (
        <p className='canvas-lights__muted' role='status'>
          {pending
            ? `Sending to ${pending} light${pending === 1 ? '' : 's'}…`
            : `Sent; waiting for ${accepted} light${accepted === 1 ? '' : 's'} to report state.`}
        </p>
      )}
    </>
  );
}

function RoomPower({ room, compact = false }: { room: CanvasRoom; compact?: boolean }) {
  const { power, busy, connected } = useCanvasLights();
  const desired = room.on > 0 ? 'off' : 'on';
  const [pendingRooms, setPendingRooms] = useState<Set<string>>(() => new Set());
  const updating = compact && pendingRooms.has(room.name);
  return (
    <button
      type='button'
      className='canvas-lights__power'
      aria-label={updating ? `Updating ${room.name} lights` : `Turn ${desired} ${room.name} lights`}
      aria-busy={updating}
      disabled={!connected || !room.available || room.lights.some(light => busy.has(light.id))}
      onClick={() => {
        setPendingRooms(current => new Set(current).add(room.name));
        void power(
          room.lights.map(light => light.id),
          desired
        ).finally(() =>
          setPendingRooms(current => {
            const next = new Set(current);
            next.delete(room.name);
            return next;
          })
        );
      }}
    >
      {updating ? 'Updating…' : `Turn ${desired}`}
    </button>
  );
}

function RoomBrightness({ room, compact = false, label = 'Room brightness' }: { room: CanvasRoom; compact?: boolean; label?: string }) {
  const { brightness, busy, connected } = useCanvasLights();
  const supported = room.lights.some(light => light.state !== 'unavailable' && lightSupportsBrightness(light.entity));
  const hasOnDimmable = room.lights.some(light => light.state === 'on' && lightSupportsBrightness(light.entity));
  const [drafts, setDrafts] = useState<Record<string, number | undefined>>({});
  const [pendingRooms, setPendingRooms] = useState<Set<string>>(() => new Set());
  const pointerActive = useRef(false);
  const cancelledPointer = useRef(false);
  const draft = drafts[room.name] ?? null;
  const committing = pendingRooms.has(room.name);
  const setDraft = (value: number) => setDrafts(current => ({ ...current, [room.name]: value }));
  const cancelPointer = () => {
    pointerActive.current = false;
    cancelledPointer.current = true;
    setDrafts(current => ({ ...current, [room.name]: undefined }));
  };
  const position = draft ?? room.brightness ?? 50;
  const commit = () => {
    if (draft === null || committing || !connected || !hasOnDimmable) return;
    setPendingRooms(current => new Set(current).add(room.name));
    void brightness(
      room.lights.map(light => light.id),
      draft
    ).then(result => {
      if (result?.results.every(item => item.phase === 'observed')) {
        setDrafts(current => {
          const next = { ...current };
          delete next[room.name];
          return next;
        });
      }
      setPendingRooms(current => {
        const next = new Set(current);
        next.delete(room.name);
        return next;
      });
    });
  };
  if (!supported)
    return (
      <p className={`canvas-lights__muted${compact ? ' canvas-lights__brightness-unavailable' : ''}`}>
        Brightness unavailable for this room.
      </p>
    );
  return (
    <label className='canvas-lights__slider'>
      <span className='canvas-lights__brightness-label'>{compact && committing ? 'Updating…' : 'Brightness'}</span>
      <input
        type='range'
        min='1'
        max='100'
        aria-label={label}
        aria-busy={committing}
        aria-valuetext={
          draft === null && room.brightnessMixed
            ? `Mixed brightness across lights; adjust lights that are on to ${position} percent`
            : `${draft !== null || room.brightness === undefined ? 'proposed' : 'reported'} ${position} percent${room.brightness === undefined ? '; current room brightness unknown' : ''}`
        }
        value={position}
        style={{ '--canvas-light-level': `${position}%` } as CSSProperties}
        disabled={!connected || !hasOnDimmable || committing || room.lights.some(light => busy.has(light.id))}
        onChange={event => {
          if (!pointerActive.current) cancelledPointer.current = false;
          setDraft(Number(event.target.value));
        }}
        onPointerDown={() => {
          pointerActive.current = true;
          cancelledPointer.current = false;
        }}
        onPointerCancel={cancelPointer}
        onPointerUp={() => {
          pointerActive.current = false;
          if (!cancelledPointer.current) commit();
        }}
        onKeyUp={() => {
          if (!pointerActive.current) commit();
        }}
        onBlur={() => {
          if (pointerActive.current) cancelPointer();
          else if (!cancelledPointer.current) commit();
        }}
      />
      <output
        aria-label={
          draft === null && room.brightnessMixed
            ? 'Mixed brightness'
            : draft !== null || room.brightness === undefined
              ? 'Proposed brightness'
              : 'Reported brightness'
        }
      >
        {draft === null && room.brightnessMixed
          ? 'Mixed'
          : compact && draft === null && room.brightness === undefined
            ? '—'
            : `${position}%`}
      </output>
      {!compact && room.brightness === undefined && <small className='canvas-lights__reading'>Current room brightness unknown</small>}
    </label>
  );
}

function IndividualLights({
  room,
  all = false,
  onOpenLight,
  onOpenAll,
}: {
  room: CanvasRoom;
  all?: boolean;
  onOpenLight?(entityId: string, trigger: HTMLElement): void;
  onOpenAll?(trigger: HTMLElement): void;
}) {
  const { connected, power, busy } = useCanvasLights();
  const [quickPending, setQuickPending] = useState<Set<string>>(() => new Set());
  const lights = all ? room.lights : room.lights.slice(0, 2);
  return (
    <div className='canvas-lights__quick' role='group' aria-label={`${room.name} individual lights`}>
      {lights.map(light => (
        <div key={light.id} className='canvas-lights__quick-light' data-on={light.state === 'on'}>
          <button
            type='button'
            className='canvas-lights__quick-power'
            aria-label={`Turn ${light.state === 'on' ? 'off' : 'on'} ${light.name}`}
            aria-pressed={light.state === 'on'}
            aria-busy={quickPending.has(light.id)}
            disabled={!connected || light.state === 'unavailable' || busy.has(light.id)}
            onClick={() => {
              setQuickPending(current => new Set(current).add(light.id));
              void power([light.id], light.state === 'on' ? 'off' : 'on').finally(() =>
                setQuickPending(current => {
                  const next = new Set(current);
                  next.delete(light.id);
                  return next;
                })
              );
            }}
          >
            <span className='canvas-lights__quick-dot' aria-hidden='true' />
            <span title={light.name}>{quickPending.has(light.id) ? 'Updating…' : quickLightName(light.name, room.name)}</span>
          </button>
          {onOpenLight && (
            <button
              type='button'
              className='canvas-lights__quick-settings'
              aria-label={`${light.name} settings`}
              data-canvas-focus-key={all ? `light:${light.id}` : undefined}
              onClick={event => onOpenLight(light.id, event.currentTarget)}
            >
              <svg viewBox='0 0 20 20' aria-hidden='true' focusable='false'>
                <path d='M4 5h12M4 10h12M4 15h12' />
                <circle cx='7' cy='5' r='2' />
                <circle cx='13' cy='10' r='2' />
                <circle cx='8' cy='15' r='2' />
              </svg>
            </button>
          )}
        </div>
      ))}
      {onOpenAll && room.lights.length > 2 && (
        <button type='button' className='canvas-lights__quick-more' onClick={event => onOpenAll(event.currentTarget)}>
          More
        </button>
      )}
    </div>
  );
}

export function CanvasLights({
  onOpenAll,
  onOpenLight,
}: {
  onOpenAll(trigger: HTMLElement): void;
  onOpenLight?(entityId: string, trigger: HTMLElement): void;
}) {
  const { rooms, selectedRoom, setSelectedRoom, connected } = useCanvasLights();
  const room = rooms.find(item => item.name === selectedRoom) ?? rooms[0];
  return (
    <section
      className='canvas-lights canvas-lights--compact'
      aria-label='Lights'
      data-room={room.name}
      style={{ '--canvas-room-accent': getRoomAccent(room.name) } as CSSProperties}
      data-lit={connected && room.on > 0}
      data-unavailable={!connected || !room.available}
    >
      <div className='canvas-lights__heading'>
        <h2>Lights</h2>
        <button type='button' className='canvas-lights__all-link' onClick={event => onOpenAll(event.currentTarget)}>
          All lights <span aria-hidden='true'>↗</span>
        </button>
      </div>
      <div className='canvas-lights__room-line'>
        <RoomArtwork room={room.name} className='canvas-lights__room-artwork' />
        <div className='canvas-lights__room-summary'>
          <CanvasRoomPicker rooms={rooms} connected={connected} value={room.name} onChange={setSelectedRoom} />
          {(!connected || room.available < room.lights.length) && (
            <p className='canvas-lights__muted'>{!connected ? 'Reconnecting…' : `${room.lights.length - room.available} unavailable`}</p>
          )}
        </div>
        <RoomPower room={room} compact />
      </div>
      <IndividualLights room={room} onOpenAll={onOpenAll} onOpenLight={onOpenLight} />
      <RoomBrightness room={room} compact />
      <CommandFeedback compact />
    </section>
  );
}

export function CanvasAllLights({ onOpenLight }: { onOpenLight(entityId: string, trigger: HTMLElement): void }) {
  const { rooms, power, busy, connected } = useCanvasLights();
  const all = rooms.flatMap(room => room.lights);
  return (
    <div className='canvas-lights canvas-lights--all'>
      <div className='canvas-lights__toolbar'>
        <button
          type='button'
          disabled={!connected || !all.some(light => light.state === 'on') || all.some(light => busy.has(light.id))}
          onClick={() =>
            void power(
              all.map(light => light.id),
              'off'
            )
          }
        >
          Turn off all lights
        </button>
      </div>
      <CommandFeedback />
      <div className='canvas-lights__grid'>
        {rooms.map(room => (
          <section
            className='canvas-lights__group'
            key={room.name}
            aria-label={`${room.name} lights`}
            data-lit={connected && room.on > 0}
            data-unavailable={!connected || !room.available}
            style={{ '--canvas-room-accent': getRoomAccent(room.name) } as CSSProperties}
          >
            <div className='canvas-lights__room-line'>
              <RoomArtwork room={room.name} className='canvas-lights__room-artwork' />
              <div className='canvas-lights__room-summary'>
                <h3>{room.name}</h3>
                {(!connected || room.available < room.lights.length) && (
                  <p className='canvas-lights__muted'>
                    {!connected ? 'Reconnecting…' : `${room.lights.length - room.available} unavailable`}
                  </p>
                )}
              </div>
              <RoomPower room={room} compact />
            </div>
            <RoomBrightness room={room} compact label={`${room.name} brightness`} />
            <IndividualLights room={room} all onOpenLight={onOpenLight} />
          </section>
        ))}
      </div>
    </div>
  );
}

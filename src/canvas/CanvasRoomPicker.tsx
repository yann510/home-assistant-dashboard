import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CanvasDialog } from './CanvasDialog';
import { RoomArtwork } from './RoomArtwork';
import { getRoomAccent } from './room-artwork';
import type { CanvasRoom } from './useCanvasLights';

/** Room selection only changes the local view; light commands remain on the card. */
export function CanvasRoomPicker({
  rooms,
  value,
  connected,
  onChange,
}: {
  rooms: CanvasRoom[];
  value: string;
  connected: boolean;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => setOpen(false);
  const show = () => {
    // Safari touch activation does not focus buttons; give the dialog a reliable return target.
    trigger.current?.focus({ preventScroll: true });
    setActive(
      Math.max(
        0,
        rooms.findIndex(room => room.name === value)
      )
    );
    setOpen(true);
  };
  const choose = (index: number) => {
    onChange(rooms[index].name);
    close();
  };
  useEffect(() => {
    if (open) menu.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      // Use the rendered grid so keyboard movement also follows responsive columns.
      const columns = menu.current ? Math.max(1, getComputedStyle(menu.current).gridTemplateColumns.split(' ').filter(Boolean).length) : 1;
      const step = event.key === 'ArrowDown' || event.key === 'ArrowUp' ? columns : 1;
      const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
      setActive(index => Math.max(0, Math.min(rooms.length - 1, index + (forward ? step : -step))));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : rooms.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const matches = (room: CanvasRoom) => room.name.toLowerCase().startsWith(event.key.toLowerCase());
      const match = rooms.findIndex((room, index) => index > active && matches(room));
      const fallback = rooms.findIndex(matches);
      if (match >= 0 || fallback >= 0) setActive(match >= 0 ? match : fallback);
    }
  };
  return (
    <>
      <button
        ref={trigger}
        type='button'
        className='canvas-lights__room-picker'
        aria-label='Lights room'
        aria-describedby={`${id}-value`}
        aria-haspopup='dialog'
        aria-expanded={open}
        onClick={() => (open ? close() : show())}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
          }
        }}
      >
        <span id={`${id}-value`}>{value}</span>
        <svg viewBox='0 0 16 16' aria-hidden='true' focusable='false'>
          <path d='m4 6 4 4 4-4' />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className='canvas canvas-room-picker-layer'>
            <CanvasDialog title='Choose a room' onClose={close}>
              <div
                ref={menu}
                id={id}
                role='listbox'
                aria-label='Lights room'
                tabIndex={0}
                aria-activedescendant={`${id}-${active}`}
                className='canvas-room-picker__grid'
                onKeyDown={onKeyDown}
              >
                {rooms.map((room, index) => {
                  const unavailable = room.lights.length - room.available;
                  const status = !connected
                    ? 'Reconnecting…'
                    : !room.available
                      ? 'Unavailable'
                      : `${room.on} on${unavailable ? ` · ${unavailable} unavailable` : ''}`;
                  return (
                    <div
                      key={room.name}
                      id={`${id}-${index}`}
                      role='option'
                      aria-label={room.name}
                      aria-describedby={`${id}-${index}-status`}
                      aria-selected={room.name === value}
                      data-index={index}
                      data-active={index === active}
                      className='canvas-room-picker__tile'
                      style={{ '--canvas-room-accent': getRoomAccent(room.name) } as CSSProperties}
                      onPointerMove={() => setActive(index)}
                      onClick={() => choose(index)}
                    >
                      <RoomArtwork room={room.name} />
                      <span className='canvas-room-picker__name'>{room.name}</span>
                      <small id={`${id}-${index}-status`}>{status}</small>
                    </div>
                  );
                })}
              </div>
            </CanvasDialog>
          </div>,
          document.body
        )}
    </>
  );
}

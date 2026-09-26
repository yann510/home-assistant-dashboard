import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { RoomArtwork } from './RoomArtwork';
import { getRoomAccent } from './room-artwork';

/** A compact room picker with a viewport-bound menu and native keyboard selection. */
export function CanvasRoomPicker({ rooms, value, onChange }: { rooms: string[]; value: string; onChange(value: string): void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 240, maxHeight: 320 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  const show = () => {
    setActive(Math.max(0, rooms.indexOf(value)));
    setOpen(true);
  };
  const choose = (index: number) => {
    onChange(rooms[index]);
    close(true);
  };
  useLayoutEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const gap = 8;
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const above = rect.top - offsetTop - gap * 2;
      const below = height + offsetTop - rect.bottom - gap * 2;
      const naturalHeight = Math.min(320, rooms.length * 44 + 12);
      const flip = below < naturalHeight && above > below;
      const maxHeight = Math.max(44, Math.min(naturalHeight, height - gap * 2, flip ? above : below));
      const menuWidth = Math.min(Math.max(rect.width, 224), width - gap * 2);
      setPosition({
        top: Math.max(
          offsetTop + gap,
          Math.min(flip ? rect.top - gap - maxHeight : rect.bottom + gap, offsetTop + height - maxHeight - gap)
        ),
        left: Math.max(offsetLeft + gap, Math.min(rect.left, offsetLeft + width - menuWidth - gap)),
        width: menuWidth,
        maxHeight,
      });
    };
    positionMenu();
    menu.current?.focus();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    window.visualViewport?.addEventListener('resize', positionMenu);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
      window.visualViewport?.removeEventListener('resize', positionMenu);
    };
  }, [open, rooms.length]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      close(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => (index + (event.key === 'ArrowDown' ? 1 : rooms.length - 1)) % rooms.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : rooms.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const match = rooms.findIndex((room, index) => index > active && room.toLowerCase().startsWith(event.key.toLowerCase()));
      const fallback = rooms.findIndex(room => room.toLowerCase().startsWith(event.key.toLowerCase()));
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
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-controls={open ? id : undefined}
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
            <div
              ref={menu}
              id={id}
              role='listbox'
              aria-label='Lights room'
              tabIndex={-1}
              aria-activedescendant={`${id}-${active}`}
              className='canvas-room-picker__popup'
              style={position}
              onKeyDown={onKeyDown}
            >
              {rooms.map((room, index) => (
                <div
                  key={room}
                  id={`${id}-${index}`}
                  role='option'
                  aria-selected={room === value}
                  data-index={index}
                  data-active={index === active}
                  className='canvas-room-picker__option'
                  style={{ '--canvas-room-accent': getRoomAccent(room) } as CSSProperties}
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(index)}
                >
                  <RoomArtwork room={room} />
                  <span>{room}</span>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

import { useLayoutEffect, useRef } from 'react';
import { CanvasLightDetails } from './CanvasLightDetails';
import { useCanvasLights } from './useCanvasLights';
import './light-settings-overlay.css';

export function LightSettingsOverlay({ entityId, onClose }: { entityId: string; onClose(): void }) {
  const { rooms } = useCanvasLights();
  const light = rooms.flatMap(room => room.lights).find(item => item.id === entityId);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const overlay = panel.current;
      const card = overlay?.parentElement;
      if (!overlay || !card) return;
      const bounds = card.getBoundingClientRect();
      const scrollport = card.closest('.canvas-dialog__body')?.getBoundingClientRect();
      const top = Math.max(8, scrollport?.top ?? 8);
      const bottom = Math.min(window.innerHeight - 8, scrollport?.bottom ?? window.innerHeight - 8);
      const height = Math.min(Math.max(bounds.height, 340), Math.max(0, bottom - top));
      overlay.style.height = `${height}px`;
      overlay.style.top = `${Math.max(top, Math.min(bounds.top, bottom - height)) - bounds.top}px`;
    };
    place();
    window.addEventListener('resize', place);
    closeButton.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('resize', place);
  }, [entityId]);
  return (
    <section
      ref={panel}
      className='canvas-light-settings'
      aria-label={`${light?.name ?? 'Light'} settings`}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        event.stopPropagation();
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <CanvasLightDetails
        key={entityId}
        entityId={entityId}
        embedded
        closeControl={
          <button ref={closeButton} type='button' aria-label='Close light settings' onClick={onClose}>
            ×
          </button>
        }
      />
    </section>
  );
}

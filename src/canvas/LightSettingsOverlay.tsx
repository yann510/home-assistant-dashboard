import { useLayoutEffect, useRef } from 'react';
import { CanvasLightDetails } from './CanvasLightDetails';
import { useCanvasLights } from './useCanvasLights';
import './light-settings-overlay.css';

export function LightSettingsOverlay({ entityId, onClose }: { entityId: string; onClose(): void }) {
  const { rooms } = useCanvasLights();
  const light = rooms.flatMap(room => room.lights).find(item => item.id === entityId);
  const closeButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
  }, [entityId]);
  return (
    <section className='canvas-light-settings' aria-label={`${light?.name ?? 'Light'} settings`}>
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

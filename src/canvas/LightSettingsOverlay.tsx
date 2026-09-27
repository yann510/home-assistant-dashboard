import { useLayoutEffect, useRef } from 'react';
import { CanvasLightDetails } from './CanvasLightDetails';
import { useCanvasLights } from './useCanvasLights';
import './light-settings-overlay.css';
import { animateCanvasExit } from './motion';

export function LightSettingsOverlay({ entityId, onClose }: { entityId: string; onClose(): void }) {
  const { rooms } = useCanvasLights();
  const light = rooms.flatMap(room => room.lights).find(item => item.id === entityId);
  const panel = useRef<HTMLElement>(null);
  const close = () => { animateCanvasExit(panel.current); onClose(); };
  const closeButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
  }, [entityId]);
  return (
    <section ref={panel} className='canvas-light-settings' aria-label={`${light?.name ?? 'Light'} settings`}>
      <CanvasLightDetails
        key={entityId}
        entityId={entityId}
        embedded
        closeControl={
          <button ref={closeButton} type='button' aria-label='Close light settings' onClick={close}>
            ×
          </button>
        }
      />
    </section>
  );
}

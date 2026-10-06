import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';

import { useCanvasOverlay } from './CanvasOverlayNavigation';

export function useLightSettings(owner: string) {
  const overlay = useCanvasOverlay(owner);
  const active = overlay.active?.entityId ? { entityId: overlay.active.entityId, room: overlay.active.room } : null;
  const trigger = useRef<HTMLElement | null>(null);
  const scroll = useRef<{ element: HTMLElement; top: number } | null>(null);
  const activeEntityId = active?.entityId;
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.element.scrollTop = scroll.current.top;
    if (!activeEntityId && trigger.current?.isConnected) {
      trigger.current.focus({ preventScroll: true });
      trigger.current = null;
      scroll.current = null;
    }
  }, [activeEntityId]);
  const close = overlay.close;
  return {
    active,
    open(entityId: string, element: HTMLElement, room?: string) {
      trigger.current = element;
      const scrollport = element.closest<HTMLElement>('.canvas-dialog__body');
      scroll.current = scrollport ? { element: scrollport, top: scrollport.scrollTop } : null;
      overlay.open({ entityId, room }, element);
    },
    close,
    onKeyDown(event: KeyboardEvent) {
      if (active && event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    },
  };
}

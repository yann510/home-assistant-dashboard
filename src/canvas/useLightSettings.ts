import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

export function useLightSettings() {
  const [active, setActive] = useState<{ entityId: string; room?: string } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const scroll = useRef<{ element: HTMLElement; top: number } | null>(null);
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.element.scrollTop = scroll.current.top;
    if (!active && trigger.current?.isConnected) {
      trigger.current.focus({ preventScroll: true });
      trigger.current = null;
      scroll.current = null;
    }
  }, [active]);
  const close = () => setActive(null);
  return {
    active,
    open(entityId: string, element: HTMLElement, room?: string) {
      trigger.current = element;
      const scrollport = element.closest<HTMLElement>('.canvas-dialog__body');
      scroll.current = scrollport ? { element: scrollport, top: scrollport.scrollTop } : null;
      setActive({ entityId, room });
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

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';

import { animateCanvasChange, animateCanvasExit } from './motion';

const focusable =
  'summary, a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function isVisible(element: HTMLElement) {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export function CanvasDialog({
  title,
  children,
  headerAccessory,
  onClose,
  onBack,
  routeKey = title,
  scrollTop = 0,
  destination,
}: {
  title: string;
  children: ReactNode;
  headerAccessory?: ReactNode;
  onClose(): void;
  onBack?(): void;
  routeKey?: string;
  scrollTop?: number;
  destination?: string;
}): React.JSX.Element {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const previousRoute = useRef(routeKey);
  useLayoutEffect(() => {
    if (previousRoute.current !== routeKey) {
      previousRoute.current = routeKey;
      return animateCanvasChange(body.current, [{ opacity: .35 }, { opacity: 1 }]);
    }
  }, [routeKey]);
  const close = () => { animateCanvasExit(panel.current); onClose(); };
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = scrollTop;
  }, [routeKey, scrollTop]);

  useEffect(() => {
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const navigation = document.querySelector<HTMLElement>('.dashboard-view-switch');
    const previousInert = navigation?.inert ?? false;
    if (navigation) navigation.inert = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (navigation) navigation.inert = previousInert;
      if (restoreTo?.isConnected) restoreTo.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const target = Array.from(body.current?.querySelectorAll<HTMLElement>('[data-canvas-destination]') ?? []).find(element => element.dataset.canvasDestination === destination);
    if (target) {
      target.scrollIntoView?.({ block: 'center' });
      target.focus({ preventScroll: true });
      target.dataset.canvasHighlighted = 'true';
      return () => { delete target.dataset.canvasHighlighted; };
    }
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
  }, [routeKey, destination]);

  return (
    <div
      className='canvas-dialog'
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          // Avoid moving focus to the backdrop after cleanup restores the trigger.
          event.preventDefault();
          close();
        }
      }}
    >
      <section
        ref={panel}
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        tabIndex={-1}
        className='canvas-dialog__panel'
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            close();
            return;
          }
          if (event.key !== 'Tab') return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(focusable)).filter(
            element =>
              !element.closest('[inert], [aria-hidden="true"], [hidden]') &&
              !element.matches(':disabled') &&
              element.tabIndex >= 0 &&
              isVisible(element) &&
              !element.closest('details:not([open]) > :not(summary)')
          );
          controls.sort((left, right) => left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
          if (controls.length === 0) {
            event.preventDefault();
            return;
          }
          const active = document.activeElement;
          const index = controls.indexOf(active as HTMLElement);
          // A destination row/panel can own focus without being in the tab order.
          // Select its nearest control in DOM order, wrapping at either boundary.
          const next = index >= 0
            ? controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]
            : event.shiftKey
              ? [...controls].reverse().find(control => active !== event.currentTarget && Boolean((active?.compareDocumentPosition(control) ?? 0) & Node.DOCUMENT_POSITION_PRECEDING)) ?? controls[controls.length - 1]
              : controls.find(control => Boolean((active?.compareDocumentPosition(control) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? controls[0];
          event.preventDefault();
          next.focus();
        }}
      >
        <header className='canvas-dialog__header'>
          {onBack && (
            <button type='button' className='canvas-dialog__back' onClick={onBack}>
              Back
            </button>
          )}
          <h2 id={titleId}>{title}</h2>
          {headerAccessory}
          <button type='button' onClick={close} aria-label='Close details' className='canvas-dialog__close'>
            ×
          </button>
        </header>
        <div ref={body} className='canvas-dialog__body'>
          {children}
        </div>
      </section>
    </div>
  );
}

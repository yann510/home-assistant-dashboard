import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';

const focusable =
  'summary, a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function CanvasDialog({
  title,
  children,
  headerAccessory,
  onClose,
  onBack,
  routeKey = title,
  scrollTop = 0,
}: {
  title: string;
  children: ReactNode;
  headerAccessory?: ReactNode;
  onClose(): void;
  onBack?(): void;
  routeKey?: string;
  scrollTop?: number;
}): React.JSX.Element {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
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
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (navigation) navigation.inert = previousInert;
      if (restoreTo?.isConnected) restoreTo.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, [routeKey]);

  return (
    <div
      className='canvas-dialog'
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
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
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(focusable)).filter(
            element =>
              !element.closest('[inert]') &&
              element.getAttribute('aria-hidden') !== 'true' &&
              !element.closest('details:not([open]) > :not(summary)')
          );
          if (controls.length === 0) {
            event.preventDefault();
            return;
          }
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
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
          <button type='button' onClick={onClose} aria-label='Close details' className='canvas-dialog__close'>
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

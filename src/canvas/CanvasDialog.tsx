import { useEffect, useId, useRef, type ReactNode } from 'react';

const focusable =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function CanvasDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }): React.JSX.Element {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (restoreTo?.isConnected) restoreTo.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, [title]);

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
            element => !element.closest('[inert]') && element.getAttribute('aria-hidden') !== 'true'
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
          <h2 id={titleId}>{title}</h2>
          <button type='button' onClick={onClose} aria-label='Close details' className='canvas-dialog__close'>
            ×
          </button>
        </header>
        <div className='canvas-dialog__body'>{children}</div>
      </section>
    </div>
  );
}

import { useEffect, type ReactNode, type RefObject } from 'react';

/** A non-native sheet lets the existing light controls open their portalled dialogs. */
export function QuietDetailSheet({
  children,
  detailsRef,
  onClose,
  panel,
}: {
  children: ReactNode;
  detailsRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  panel: string;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    detailsRef.current?.scrollTo?.(0, 0);
    detailsRef.current?.focus({ preventScroll: true });
  }, [panel, detailsRef]);
  return (
    <div
      className='quiet-sheet-backdrop'
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={detailsRef}
        tabIndex={-1}
        role='dialog'
        aria-modal='true'
        aria-labelledby='quiet-details-title'
        className='quiet-detail-panel'
        onKeyDown={event => {
          // Let nested HAKit dialogs own their keyboard events.
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
          if (event.key !== 'Tab') return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')
          ).filter(element => !element.closest('[inert]') && element.getClientRects().length > 0);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first) {
            event.preventDefault();
            return;
          }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        {children}
      </section>
    </div>
  );
}

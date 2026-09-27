import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Animate identity changes, never polling updates or unconfirmed device actions. */
export function usePulseMotion(container: RefObject<HTMLDivElement | null>, keys: readonly string[]) {
  const previous = useRef(new Set<string>());
  const signature = JSON.stringify(keys);
  useLayoutEffect(() => {
    const next = new Set<string>(JSON.parse(signature));
    const removed = [...previous.current].some(key => !next.has(key));
    const entered = new Set([...next].filter(key => !previous.current.has(key)));
    previous.current = next;
    const element = container.current;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!element || preference?.matches || (!removed && !entered.size)) return;
    const animations: Animation[] = [];
    const stop = () => animations.forEach(animation => animation.cancel());
    // One small batch of visual-only animations; no snapshots, clones or reflow.
    for (const item of element.querySelectorAll<HTMLElement>('[data-pulse-key]')) {
      if (!item.animate) continue;
      const arriving = entered.has(item.dataset.pulseKey!);
      if (!arriving && !removed) continue;
      try {
        animations.push(
          item.animate(
            arriving
              ? [
                  { opacity: 0, transform: 'translateY(4px)' },
                  { opacity: 1, transform: 'translateY(0)' },
                ]
              : [{ opacity: 0.8 }, { opacity: 1 }],
            { duration: arriving ? 180 : 140, easing: 'cubic-bezier(.2,.7,.3,1)' }
          )
        );
      } catch {
        /* Visual enhancement only; the new state is already usable. */
      }
    }
    preference?.addEventListener?.('change', stop);
    return () => {
      preference?.removeEventListener?.('change', stop);
      stop();
    };
  }, [container, signature]);
}

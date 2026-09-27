import { useEffect, useRef } from 'react';

/** Fade changed reported content without replacing its DOM or interrupting controls. */
export function useControlChangeFade<T extends HTMLElement>(value: unknown, selector?: string) {
  const ref = useRef<T>(null);
  const previous = useRef(value);
  const animations = useRef<Animation[]>([]);
  useEffect(() => {
    const node = ref.current;
    if (!node || Object.is(previous.current, value)) return;
    previous.current = value;
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const targets = selector ? Array.from(node.querySelectorAll<HTMLElement>(selector)) : [node];
    animations.current = targets.flatMap(target => {
      try {
        return typeof target.animate === 'function'
          ? [target.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })]
          : [];
      } catch {
        return [];
      }
    });
  });
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const cancel = () => {
      animations.current.forEach(animation => animation.cancel());
      animations.current = [];
    };
    const update = () => {
      if (preference?.matches) cancel();
    };
    preference?.addEventListener?.('change', update);
    return () => {
      preference?.removeEventListener?.('change', update);
      cancel();
    };
  }, []);
  return ref;
}

import { useEffect, useState } from 'react';

/** Semantic revisions key decorative layers only; ordinary store updates stay still. */
export function useFeatureMotion(value: string | null) {
  const [snapshot, setSnapshot] = useState({ value, revision: 0, animate: false });
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    // Retire the current flourish in either direction: enabling motion is not a new event.
    const retire = () => setSnapshot(previous => (previous.animate ? { ...previous, animate: false } : previous));
    preference?.addEventListener?.('change', retire);
    return () => preference?.removeEventListener?.('change', retire);
  }, []);
  if (snapshot.value !== value) {
    const next = {
      value,
      revision: snapshot.revision + 1,
      animate: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    };
    setSnapshot(next);
    return next;
  }
  return snapshot;
}

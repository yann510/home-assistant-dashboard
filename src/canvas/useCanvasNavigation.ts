import { useEffect, useRef, useState } from 'react';
import type { CanvasOverlay } from './CanvasOverlayNavigation';
import type { CanvasRoute } from './routes';

type Visit = { route: CanvasRoute; depth: number; focus: string | null; scrollTop: number; overlay: CanvasOverlay | null };
type Record = Visit & { session: string };
const key = '__canvasNavigation';
const overview: Visit = { route: { kind: 'overview' }, depth: 0, focus: null, scrollTop: 0, overlay: null };

// Keep the page URL and host-owned state intact. A fresh mount deliberately
// ignores old dialog records, including records left behind by a reload.
export function useCanvasNavigation() {
  const [initialSession] = useState(() => `canvas-${Date.now()}-${Math.random()}`);
  const session = useRef(initialSession);
  const current = useRef<Visit>(overview);
  const pending = useRef(false);
  const closeAfterTraversal = useRef(false);
  const [visit, setVisit] = useState<Visit>(overview);
  function write(next: Visit, push = false) {
    const state = { ...window.history.state, [key]: { ...next, session: session.current } };
    window.history[push ? 'pushState' : 'replaceState'](state, '', window.location.href);
  }
  useEffect(() => {
    write(overview);
    function pop(event: PopStateEvent) {
      pending.current = false;
      const record = event.state?.[key] as Record | undefined;
      const next = record?.session === session.current ? record : overview;
      current.current = next;
      setVisit(next);
      if (closeAfterTraversal.current) {
        closeAfterTraversal.current = false;
        close();
        return;
      }
      if (next === overview) write(overview);
    }
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  function open(route: CanvasRoute, trigger: HTMLElement) {
    if (pending.current) return;
    const previous = { ...current.current, focus: trigger.dataset.canvasFocusKey || trigger.getAttribute('aria-label') || trigger.textContent, scrollTop: document.querySelector('.canvas-dialog__body')?.scrollTop ?? 0 };
    if (!previous.overlay) write(previous);
    const next = { route, depth: previous.depth + (previous.overlay ? 0 : 1), focus: null, scrollTop: 0, overlay: null };
    write(next, !previous.overlay);
    current.current = next;
    setVisit(next);
  }
  function openOverlay(overlay: CanvasOverlay, trigger: HTMLElement) {
    if (pending.current) return;
    const previous = { ...current.current, focus: trigger.dataset.canvasFocusKey || trigger.getAttribute('aria-label') || trigger.textContent, scrollTop: trigger.closest('.canvas-dialog__body')?.scrollTop ?? 0 };
    if (!previous.overlay) write(previous);
    const next = { ...previous, overlay, depth: previous.depth + (previous.overlay ? 0 : 1), focus: null };
    write(next, !previous.overlay);
    current.current = next;
    setVisit(next);
  }
  function closeOverlay() {
    if (!current.current.overlay || pending.current) return;
    back();
    // Hide immediately for Escape/selection; the traversal restores parent context.
    setVisit({ ...current.current, depth: current.current.depth - 1, overlay: null });
  }
  function back() {
    if (pending.current || current.current.depth === 0) return;
    pending.current = true;
    window.history.back();
  }
  function close() {
    if (pending.current) {
      closeAfterTraversal.current = true;
      return;
    }
    if (current.current.depth === 0) return;
    const depth = current.current.depth;
    pending.current = true;
    window.history.go(-depth);
    current.current = overview;
    setVisit(overview);
  }
  return { ...visit, routeDepth: visit.depth - (visit.overlay ? 1 : 0), open, back, close, openOverlay, closeOverlay };
}

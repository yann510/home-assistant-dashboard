// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { animateCanvasChange, animateCanvasExit } from './motion';
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (Element.prototype as Partial<Element>).animate;
});
it('skips decorative motion when reduced motion is requested or WAAPI is absent', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const element = document.createElement('div');
  element.animate = vi.fn();
  animateCanvasChange(element, [{ opacity: 0 }]);
  animateCanvasExit(element);
  expect(element.animate).not.toHaveBeenCalled();
  expect(document.querySelector('.canvas-motion-exit')).toBeNull();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  expect(() => animateCanvasChange(document.createElement('div'), [])()).not.toThrow();
});
it('allows an interrupted value transition to be cancelled', () => {
  const cancel = vi.fn();
  const element = document.createElement('div');
  element.animate = vi.fn(() => ({ cancel }) as unknown as Animation);
  animateCanvasChange(element, [{ opacity: 0.5 }, { opacity: 1 }])();
  expect(cancel).toHaveBeenCalledOnce();
});
it('keeps exit copies inert, strips identities and always removes them', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const element = document.createElement('section');
  element.innerHTML = '<button id="close" autofocus>Close</button><p role="status" aria-live="polite">Saving</p>';
  document.body.append(element);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 100, left: 10, top: 10 } as DOMRect);
  Element.prototype.animate = vi.fn(() => ({ finished: new Promise(() => {}) }) as unknown as Animation);
  animateCanvasExit(element);
  const copy = document.querySelector<HTMLElement>('.canvas-motion-exit')!;
  expect(copy.inert).toBe(true);
  expect(copy.getAttribute('aria-hidden')).toBe('true');
  expect(copy.querySelector('[id], [role], [aria-live], [autofocus]')).toBeNull();
  expect(copy.querySelector('button')?.disabled).toBe(true);
  expect(copy.querySelector('button')?.tabIndex).toBe(-1);
  expect(document.getElementById('close')).toBe(element.firstChild);
  vi.advanceTimersByTime(250);
  expect(copy.isConnected).toBe(false);
});

it('cancels active motion when reduced-motion preferences change', () => {
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: (_: string, callback: () => void) => listeners.add(callback),
    removeEventListener: (_: string, callback: () => void) => listeners.delete(callback),
  }));
  const element = document.createElement('div');
  const cancel = vi.fn();
  element.animate = vi.fn(() => ({ cancel }) as unknown as Animation);
  animateCanvasChange(element, [{ opacity: 0.5 }, { opacity: 1 }]);
  listeners.forEach(listener => listener());
  expect(cancel).toHaveBeenCalledOnce();
  expect(listeners.size).toBe(0);
});

it('creates only one exit copy when panel and parent both close the same element', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const element = document.createElement('section');
  document.body.append(element);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 100, left: 0, top: 0 } as DOMRect);
  Element.prototype.animate = vi.fn(() => ({ finished: new Promise(() => {}) }) as unknown as Animation);
  animateCanvasExit(element);
  animateCanvasExit(element);
  expect(document.querySelectorAll('.canvas-motion-exit')).toHaveLength(1);
  expect(Element.prototype.animate).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(250);
  expect(document.querySelector('.canvas-motion-exit')).toBeNull();
});

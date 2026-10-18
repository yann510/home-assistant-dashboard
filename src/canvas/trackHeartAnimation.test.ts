// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { animateTrackHeart } from './trackHeartAnimation';
let reduced = false;
let changed: (() => void) | undefined;
let element: HTMLButtonElement;
let finish: Array<() => void>;
let cancel: ReturnType<typeof vi.fn>;
beforeEach(() => {
  reduced = false;
  finish = [];
  cancel = vi.fn();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, fn: () => void) => {
      changed = fn;
    },
    removeEventListener: vi.fn(),
  }));
  element = document.createElement('button');
  element.innerHTML = '<svg data-heart-icon></svg><span data-heart-decoration></span>';
  document.body.append(element);
  Element.prototype.animate = vi.fn(() => ({ cancel, finished: new Promise<void>(resolve => finish.push(resolve)) })) as never;
});
afterEach(() => {
  element.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('runs the confirmed save effect for 420ms with contained, aria-hidden pointer-inert sparkles and cleans completed effects', async () => {
  animateTrackHeart(element, true);
  expect(Element.prototype.animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 420 }));
  const layer = element.querySelector('[data-heart-decoration]')!;
  expect(layer.getAttribute('aria-hidden')).toBe('true');
  expect((layer as HTMLElement).style.pointerEvents).toBe('none');
  expect(layer.children.length).toBeGreaterThan(1);
  finish.forEach(resolve => resolve());
  await Promise.resolve();
  await Promise.resolve();
  expect(layer.children).toHaveLength(0);
  expect(cancel).toHaveBeenCalled();
});
it('uses the softer 240ms removal and has no particles', () => {
  const stop = animateTrackHeart(element, false);
  expect(Element.prototype.animate).toHaveBeenCalledExactlyOnceWith(expect.any(Array), expect.objectContaining({ duration: 240 }));
  expect(element.querySelector('[data-heart-decoration]')!.children).toHaveLength(0);
  stop();
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('honors reduced motion before starting and cancels on preference change', () => {
  reduced = true;
  animateTrackHeart(element, true);
  expect(Element.prototype.animate).not.toHaveBeenCalled();
  reduced = false;
  animateTrackHeart(element, true);
  reduced = true;
  changed?.();
  expect(cancel).toHaveBeenCalled();
  expect(element.querySelector('[data-heart-decoration]')!.children).toHaveLength(0);
});
it('best-effort cleanup tolerates unsupported and throwing animation APIs, rejected animations and repeated cancellation', async () => {
  delete (Element.prototype as { animate?: unknown }).animate;
  expect(() => animateTrackHeart(element, true)()).not.toThrow();
  Element.prototype.animate = vi.fn(() => {
    throw new Error('unsupported');
  }) as never;
  expect(() => animateTrackHeart(element, true)()).not.toThrow();
  Element.prototype.animate = vi.fn(() => ({ cancel, finished: Promise.reject(new Error('cancelled')) })) as never;
  const stop = animateTrackHeart(element, true);
  await Promise.resolve();
  await Promise.resolve();
  stop();
  stop();
  expect(element.querySelector('[data-heart-decoration]')!.children).toHaveLength(0);
});

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { animateFavouriteArtwork } from './favouriteArtworkTransition';

let image: HTMLImageElement;
let target: HTMLDivElement;
let finish: () => void;
let cancel: () => void;
const animate = vi.fn();
beforeEach(() => {
  image = document.createElement('img');
  target = document.createElement('div');
  document.body.append(image, target);
  Object.defineProperty(image, 'naturalWidth', { value: 200 });
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 160, 160));
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(400, 50, 64, 64));
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  animate.mockReset().mockImplementation(() => ({ finished: new Promise<void>((resolve, reject) => { finish = resolve; cancel = () => reject(new Error('Cancelled')); }) }));
  vi.stubGlobal('getComputedStyle', () => ({ borderRadius: '16px' }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
});
afterEach(() => {
  document.body.replaceChildren();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('flies the selected artwork to the cover and removes the decorative copy', async () => {
  animateFavouriteArtwork(image, target);
  expect(animate).toHaveBeenCalledWith([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: 'translate(300px, -50px) scale(0.4, 0.4)', opacity: 0.85 },
  ], expect.objectContaining({ duration: 420 }));
  expect(document.querySelectorAll('img')).toHaveLength(2);
  expect(document.querySelector('img[aria-hidden]')?.getAttribute('style')).toContain('pointer-events: none');
  finish();
  await Promise.resolve();
  expect(document.querySelectorAll('img')).toHaveLength(1);
});
it('skips animation with reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  animateFavouriteArtwork(image, target);
  expect(animate).not.toHaveBeenCalled();
});
it('skips missing artwork, unloaded images and offscreen targets', () => {
  animateFavouriteArtwork(null, target);
  animateFavouriteArtwork(document.createElement('img'), target);
  vi.mocked(target.getBoundingClientRect).mockReturnValue(new DOMRect(400, -100, 64, 64));
  animateFavouriteArtwork(image, target);
  expect(animate).not.toHaveBeenCalled();
});
it('cleans up without blocking closing if the animation API fails', () => {
  animate.mockImplementation(() => { throw new Error('Unavailable'); });
  expect(() => animateFavouriteArtwork(image, target)).not.toThrow();
  expect(document.querySelectorAll('img')).toHaveLength(1);
});

it('removes the decorative copy when animation is cancelled', async () => {
  animateFavouriteArtwork(image, target);
  cancel();
  await Promise.resolve();
  expect(document.querySelectorAll('img')).toHaveLength(1);
});

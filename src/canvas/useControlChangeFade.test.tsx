// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useControlChangeFade } from './useControlChangeFade';

function Content({ value, ready = true }: { value: string; ready?: boolean }) {
  const ref = useControlChangeFade<HTMLDivElement>(value);
  return ready ? (
    <div ref={ref}>
      <button>Stable control</button>
      <span>{value}</span>
    </div>
  ) : null;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('fades only changed values, preserves controls and focus, and cancels on unmount', () => {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }));
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  const { rerender, unmount } = render(<Content value='hourly' />);
  const button = screen.getByRole('button');
  button.focus();
  expect(animate).not.toHaveBeenCalled();
  rerender(<Content value='daily' />);
  expect(animate).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button')).toBe(button);
  expect(document.activeElement).toBe(button);
  rerender(<Content value='daily' />);
  expect(animate).toHaveBeenCalledTimes(1);
  unmount();
  expect(cancel).toHaveBeenCalledTimes(1);
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});
it('honors reduced motion and handles forecast content arriving after loading', () => {
  let reduced = true;
  const animate = vi.fn(() => ({ cancel: vi.fn() }));
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  const { rerender } = render(<Content value='hourly' />);
  rerender(<Content value='daily' />);
  expect(animate).not.toHaveBeenCalled();
  reduced = false;
  rerender(<Content value='hourly' ready={false} />);
  rerender(<Content value='hourly' />);
  expect(animate).toHaveBeenCalledTimes(1);
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});
it('cancels live motion on preference change without replaying and tolerates animation failure', () => {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }));
  let changed = () => {};
  const preference = {
    matches: false,
    addEventListener: vi.fn((_event, callback) => {
      changed = callback;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', () => preference);
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  const { rerender, unmount } = render(<Content value='hourly' />);
  rerender(<Content value='daily' />);
  preference.matches = true;
  changed();
  expect(cancel).toHaveBeenCalledTimes(1);
  preference.matches = false;
  changed();
  rerender(<Content value='daily' />);
  expect(animate).toHaveBeenCalledTimes(1);
  animate.mockImplementation(() => {
    throw new Error('Animation unavailable');
  });
  expect(() => rerender(<Content value='hourly' />)).not.toThrow();
  expect(screen.getByText('hourly')).toBeTruthy();
  unmount();
  expect(preference.removeEventListener).toHaveBeenCalledWith('change', changed);
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});

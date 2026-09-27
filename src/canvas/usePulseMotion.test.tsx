// @vitest-environment jsdom
import { useRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePulseMotion } from './usePulseMotion';

function Pulse({ keys, reading = 'Running' }: { keys: string[]; reading?: string }) {
  const container = useRef<HTMLDivElement>(null);
  usePulseMotion(container, keys);
  return (
    <div ref={container}>
      {keys.map(key => (
        <button key={key} data-pulse-key={key}>
          {reading}
        </button>
      ))}
    </div>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mockMotion(reduced = false) {
  const cancel = vi.fn();
  const animate = vi.fn().mockReturnValue({ cancel });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  const changes = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: (_: string, listener: () => void) => changes.add(listener),
    removeEventListener: (_: string, listener: () => void) => changes.delete(listener),
  }));
  return { animate, cancel, changes };
}
it('animates new identities once, not repeated readings or polls', () => {
  const { animate } = mockMotion();
  const view = render(<Pulse keys={['washer']} />);
  expect(animate).toHaveBeenCalledTimes(1);
  const original = view.container.querySelector('button');
  view.rerender(<Pulse keys={['washer']} reading='12 minutes left' />);
  expect(animate).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector('button')).toBe(original);
  view.rerender(<Pulse keys={['washer', 'roomba']} />);
  expect(animate).toHaveBeenCalledTimes(2);
  expect(animate.mock.calls[1][0][0]).toEqual({ opacity: 0, transform: 'translateY(4px)' });
});
it('removes obsolete controls immediately and settles survivors without moving them', () => {
  const { animate } = mockMotion();
  const view = render(<Pulse keys={['washer', 'roomba']} />);
  animate.mockClear();
  view.rerender(<Pulse keys={['roomba']} />);
  expect(view.container.querySelectorAll('button')).toHaveLength(1);
  expect(view.container.querySelector('[data-pulse-key="washer"]')).toBeNull();
  expect(animate).toHaveBeenCalledWith([{ opacity: 0.8 }, { opacity: 1 }], expect.objectContaining({ duration: 140 }));
});
it('skips reduced motion and cancels running effects when that preference changes', () => {
  const { animate } = mockMotion(true);
  const first = render(<Pulse keys={['washer']} />);
  expect(animate).not.toHaveBeenCalled();
  first.unmount();
  const normal = mockMotion();
  const second = render(<Pulse keys={['washer']} />);
  normal.changes.forEach(listener => listener());
  expect(normal.cancel).toHaveBeenCalled();
  second.unmount();
  expect(normal.changes.size).toBe(0);
});
it('keeps controls usable when Web Animations is unavailable or throws', () => {
  const { animate } = mockMotion();
  animate.mockImplementation(() => {
    throw new Error('No animation support');
  });
  const view = render(<Pulse keys={['washer']} />);
  expect(view.container.querySelector('button')).toBeTruthy();
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: undefined });
  view.rerender(<Pulse keys={['washer', 'roomba']} />);
  expect(view.container.querySelectorAll('button')).toHaveLength(2);
});

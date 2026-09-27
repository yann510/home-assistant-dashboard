// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFeatureMotion } from './useFeatureMotion';

function Feature({ value }: { value: string }) {
  const motion = useFeatureMotion(value);
  return (
    <span key={motion.revision} data-testid='art' data-motion={motion.animate}>
      {value}
    </span>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('retires motion when preferences change without replaying or remounting decorative content', () => {
  let reduced = false;
  let listener: (() => void) | undefined;
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: (_event: string, callback: () => void) => {
      listener = callback;
    },
    removeEventListener: vi.fn(),
  }));
  const view = render(<Feature value='love' />);
  expect(screen.getByTestId('art').getAttribute('data-motion')).toBe('false');
  view.rerender(<Feature value='party' />);
  const art = screen.getByTestId('art');
  expect(art.getAttribute('data-motion')).toBe('true');
  act(() => {
    reduced = true;
    listener?.();
  });
  expect(art.getAttribute('data-motion')).toBe('false');
  act(() => {
    reduced = false;
    listener?.();
  });
  expect(screen.getByTestId('art')).toBe(art);
  expect(art.getAttribute('data-motion')).toBe('false');
  view.rerender(<Feature value='gym' />);
  expect(screen.getByTestId('art').getAttribute('data-motion')).toBe('true');
  act(() => {
    reduced = true;
    listener?.();
  });
  view.rerender(<Feature value='dinner' />);
  expect(screen.getByTestId('art').getAttribute('data-motion')).toBe('false');
});

// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasMood } from './CanvasMood';
import type { HouseMoodCardProps } from '../moodTypes';

afterEach(cleanup);

it('reuses the caption for progress and recovery without adding status rows', () => {
  const base: HouseMoodCardProps = {
    status: { phase: 'active', activeMood: 'unwind', pendingMood: null, errors: [] },
    connected: true,
    available: true,
    onActivate: vi.fn(),
    onEnd: vi.fn(),
    onRetry: vi.fn(),
  };
  const view = render(<CanvasMood controller={base} />);
  const caption = screen.getByText('Let the day drift away.');
  const actions = screen.getByRole('button', { name: 'End mood' }).parentElement;
  view.rerender(<CanvasMood controller={{ ...base, status: { ...base.status, phase: 'restoring' } }} />);
  expect(screen.getByRole('status')).toBe(caption);
  expect(caption.textContent).toBe('Restoring previous settings…');
  expect(screen.getByRole('button', { name: 'End mood' }).parentElement).toBe(actions);
  expect((screen.getByRole('button', { name: 'End mood' }) as HTMLButtonElement).disabled).toBe(true);
  expect(
    within(screen.getByRole('group', { name: 'Choose a house mood' }))
      .getAllByRole('button')
      .every(button => (button as HTMLButtonElement).disabled)
  ).toBe(true);
  view.rerender(<CanvasMood controller={{ ...base, status: { phase: 'idle', activeMood: null, pendingMood: null, errors: [] } }} />);
  expect(screen.getByText('Your space. Your own pace.')).toBe(caption);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('button', { name: 'End mood' })).toBeNull();
  view.rerender(
    <CanvasMood controller={{ ...base, status: { phase: 'starting', activeMood: null, pendingMood: 'unwind', errors: [] } }} />
  );
  expect(screen.getByRole('status')).toBe(caption);
  expect(caption.textContent).toBe('Starting mood…');
  view.rerender(
    <CanvasMood
      controller={{
        ...base,
        status: { ...base.status, phase: 'recovery_required', errors: [{ target: 'light', message: 'Could not restore light' }] },
      }}
    />
  );
  expect(screen.getByRole('status')).toBe(caption);
  expect(screen.getByRole('alert').textContent).toContain('Could not restore light');
  expect(screen.getByRole('button', { name: 'Retry restoration' })).toBeTruthy();
});

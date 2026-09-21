// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QuietMoodCard } from './QuietMoodCard';
import type { HouseMoodCardProps } from './HouseMoodCard';
afterEach(cleanup);
const props = (): HouseMoodCardProps & { onOpen: () => void } => ({
  connected: true,
  available: true,
  status: { phase: 'idle', activeMood: null, pendingMood: null, errors: [] },
  onActivate: vi.fn(),
  onEnd: vi.fn(),
  onRetry: vi.fn(),
  onOpen: vi.fn(),
});
it('keeps idle state honest and opens existing mood selection', () => {
  const p = props();
  render(<QuietMoodCard {...p} />);
  expect(screen.queryByText('Active across your home')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Choose a mood' }));
  expect(p.onOpen).toHaveBeenCalledOnce();
  expect(p.onActivate).not.toHaveBeenCalled();
});
it('shows active mood and forwards End through the existing guarded action', () => {
  const p = props();
  p.status = { ...p.status, phase: 'active', activeMood: 'love' };
  render(<QuietMoodCard {...p} />);
  expect(screen.getByRole('heading', { name: 'Love' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'End mood' }));
  expect(p.onEnd).toHaveBeenCalledOnce();
});
it('surfaces recovery and errors without opening details', () => {
  const p = props();
  p.status = { ...p.status, phase: 'recovery_required', errors: [{ target: 'light', message: 'Light unavailable' }] };
  render(<QuietMoodCard {...p} />);
  expect(screen.getByRole('alert').textContent).toContain('Light unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Retry restoration' }));
  expect(p.onRetry).toHaveBeenCalledOnce();
});
it('blocks End while restoring and during a disconnect', () => {
  const p = props();
  p.status = { ...p.status, phase: 'restoring', activeMood: 'love' };
  const view = render(<QuietMoodCard {...p} />);
  expect((screen.getByRole('button', { name: 'End mood' }) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<QuietMoodCard {...p} connected={false} status={{ ...p.status, phase: 'active' }} />);
  expect((screen.getByRole('button', { name: 'End mood' }) as HTMLButtonElement).disabled).toBe(true);
});

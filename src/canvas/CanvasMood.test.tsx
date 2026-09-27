// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

it('animates confirmed mood changes once without replacing controls or celebrating pending requests', () => {
  const base: HouseMoodCardProps = {
    status: { phase: 'idle', activeMood: null, pendingMood: null, errors: [] },
    connected: true,
    available: true,
    onActivate: vi.fn(),
    onEnd: vi.fn(),
    onRetry: vi.fn(),
  };
  const view = render(<CanvasMood controller={base} />);
  const card = screen.getByRole('region', { name: 'House Mood' });
  const initialArt = card.querySelector('.canvas-mood__art');
  const button = screen.getByRole('button', { name: 'Love mood' });
  expect(card.getAttribute('data-feature-motion')).toBe('false');
  view.rerender(<CanvasMood controller={{ ...base, status: { ...base.status, phase: 'starting', pendingMood: 'love' } }} />);
  expect(card.getAttribute('data-mood')).toBe('neutral');
  expect(card.querySelector('.canvas-mood__art')).toBe(initialArt);
  const active: HouseMoodCardProps = { ...base, status: { ...base.status, phase: 'active', activeMood: 'love' } };
  view.rerender(<CanvasMood controller={active} />);
  const loveArt = card.querySelector('.canvas-mood__art');
  expect(loveArt).not.toBe(initialArt);
  expect(card.getAttribute('data-feature-motion')).toBe('true');
  expect(card.getAttribute('data-mood')).toBe('love');
  expect(screen.getByRole('button', { name: 'Love mood' })).toBe(button);
  view.rerender(<CanvasMood controller={{ ...active, status: { ...active.status } }} />);
  expect(card.querySelector('.canvas-mood__art')).toBe(loveArt);
  view.rerender(<CanvasMood controller={{ ...active, status: { ...active.status, phase: 'restoring' } }} />);
  expect(card.getAttribute('data-mood')).toBe('neutral');
  expect(screen.getByRole('heading', { name: 'Just be.' })).toBeTruthy();
});

it('names Chill consistently while retaining its backend ID and distinct artwork', () => {
  const base: HouseMoodCardProps = {
    status: { phase: 'idle', activeMood: null, pendingMood: null, errors: [] },
    connected: true,
    available: true,
    onActivate: vi.fn(),
    onEnd: vi.fn(),
    onRetry: vi.fn(),
  };
  const view = render(<CanvasMood controller={base} />);
  const paths = () => Array.from(view.container.querySelectorAll('.canvas-mood__art path')).map(path => path.getAttribute('d'));
  const neutralArtwork = paths();
  fireEvent.click(screen.getByRole('button', { name: 'Chill mood' }));
  expect(base.onActivate).toHaveBeenCalledExactlyOnceWith('unwind');
  view.rerender(<CanvasMood controller={{ ...base, status: { ...base.status, phase: 'active', activeMood: 'unwind' } }} />);
  expect(screen.getByRole('heading', { name: 'Chill' })).toBeTruthy();
  expect(screen.queryByText('Unwind')).toBeNull();
  expect(paths()).not.toEqual(neutralArtwork);
});

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HouseMoodCard, type HouseMoodCardProps } from './HouseMoodCard';

afterEach(cleanup);
const props = (): HouseMoodCardProps => ({
  status: { phase: 'idle', activeMood: null, pendingMood: null, errors: [] },
  connected: true,
  available: true,
  onActivate: vi.fn(),
  onEnd: vi.fn(),
  onRetry: vi.fn(),
});

describe('House mood card', () => {
  it('starts any of the five moods directly without extra controls', async () => {
    const p = props();
    render(<HouseMoodCard {...p} />);
    for (const name of ['Love', 'Unwind', 'Dinner', 'Party', 'Gym']) {
      await userEvent.click(screen.getByRole('button', { name }));
      expect(p.onActivate).toHaveBeenLastCalledWith(name.toLowerCase());
    }
    expect(screen.queryByRole('button', { name: /details|settings|End mood/i })).toBeNull();
  });
  it('marks the active mood and does not restart it on repeated taps', async () => {
    const p = props();
    p.status = { ...p.status, phase: 'active', activeMood: 'love' };
    render(<HouseMoodCard {...p} />);
    expect(screen.getByRole('button', { name: 'Love' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Love is on')).toBeNull();
    expect(screen.getByRole('button', { name: 'End mood' }).closest('header')?.contains(screen.getByRole('heading', { name: 'House Mood' }))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Love' }));
    expect(p.onActivate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Party' }));
    expect(p.onActivate).toHaveBeenCalledWith('party');
    await userEvent.click(screen.getByRole('button', { name: 'End mood' }));
    expect(p.onEnd).toHaveBeenCalledOnce();
  });
  it.each(['starting', 'restoring'] as const)('locks changes while %s', async phase => {
    const p = props();
    p.status = { ...p.status, phase, pendingMood: phase === 'starting' ? 'love' : null };
    render(<HouseMoodCard {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Love' }));
    expect(p.onActivate).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button').every(b => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('status').textContent).toContain(phase === 'starting' ? 'Starting' : 'Restoring');
  });
  it('keeps recovery visible and only allows retry until restoration finishes', async () => {
    const p = props();
    p.status = {
      ...p.status,
      phase: 'recovery_required',
      errors: [{ target: 'light.neon_light_led_strip', message: 'Office neon couldn’t be restored.' }],
    };
    render(<HouseMoodCard {...p} />);
    expect(screen.getByRole('alert').textContent).toContain('Office neon couldn’t be restored.');
    await userEvent.click(screen.getByRole('button', { name: 'Love' }));
    expect(p.onActivate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry restoration' }));
    expect(p.onRetry).toHaveBeenCalledOnce();
  });
  it.each(['connected', 'available'] as const)('does not send commands without %s', async key => {
    const p = props();
    p[key] = false;
    render(<HouseMoodCard {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Love' }));
    expect(p.onActivate).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/Reconnecting|unavailable/);
  });
  it('supports keyboard activation', async () => {
    const p = props();
    render(<HouseMoodCard {...p} />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(p.onActivate).toHaveBeenCalledWith('love');
  });
});

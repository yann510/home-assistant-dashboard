// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttentionStrip, AttentionTarget } from './AttentionStrip';
import { parseAttention, type AttentionItem } from './attention';
afterEach(cleanup);
const item = (id: string, values: Partial<AttentionItem> = {}): AttentionItem => ({
  id,
  episode: id + '-1',
  title: id,
  detail: 'Needs checking',
  tone: 'amber',
  icon: 'bin',
  target: 'vacuum',
  occurred_at: '2026-09-10T00:00:00Z',
  kind: 'condition',
  snoozed_until: null,
  snooze_seconds: 14400,
  ...values,
});
const props = {
  connected: true,
  ready: true,
  disconnected: false,
  night: false,
  now: Date.parse('2026-09-10T00:12:00Z'),
  busy: false,
  error: null,
  onAction: vi.fn(),
  onView: vi.fn(),
};
describe('attention strip', () => {
  it('scrolls again when View is clicked twice for the same reminder', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const reminder = item('Bin');
    function Harness() {
      const [selected, select] = useState<AttentionItem | null>(null);
      return (
        <>
          <AttentionStrip {...props} items={[reminder]} onView={select} />
          <AttentionTarget name='vacuum' selected={selected} onClose={() => select(null)}>
            <p>Vacuum controls</p>
          </AttentionTarget>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'View: Bin' }));
    expect(scroll).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'View: Bin' }));
    expect(scroll).toHaveBeenCalledTimes(2);
  });
  it('hides clear state, expands hidden items, and only offers Done for completions', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AttentionStrip {...props} items={[]} />);
    expect(screen.queryByRole('region')).toBeNull();
    rerender(<AttentionStrip {...props} items={[item('Laundry', { kind: 'completion' }), item('Bin'), item('Battery')]} />);
    expect(screen.queryByText('Battery')).toBeNull();
    await user.click(screen.getByRole('button', { name: /View all/ }));
    expect(screen.getByText('Battery')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Done/ })).toHaveLength(1);
  });
  it('View delegates only the local target and does not acknowledge or navigate', async () => {
    const onView = vi.fn(),
      onAction = vi.fn();
    render(<AttentionStrip {...props} onView={onView} onAction={onAction} items={[item('Bin')]} />);
    const before = window.location.href;
    await userEvent.click(screen.getByRole('button', { name: 'View: Bin' }));
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ target: 'vacuum' }));
    expect(onAction).not.toHaveBeenCalled();
    expect(document.querySelector('a')).toBeNull();
    expect(window.location.href).toBe(before);
  });
  it('keeps snoozed reminders reachable and allows restoring them', async () => {
    const action = vi.fn();
    render(<AttentionStrip {...props} onAction={action} items={[item('Bin', { snoozed_until: '2026-09-10T04:00:00Z' })]} />);
    expect(screen.queryByRole('heading', { name: /Needs attention/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Snoozed/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restore: Bin' }));
    expect(action).toHaveBeenCalledWith('unsnooze', expect.objectContaining({ episode: 'Bin-1' }));
  });
  it('replaces device warnings with one connection banner and disables mutation while disconnected', () => {
    render(<AttentionStrip {...props} connected={false} disconnected items={[item('Bin')]} />);
    expect(screen.queryByText('Bin')).toBeNull();
    expect(screen.getByText(/Reconnecting to Home Assistant/)).toBeTruthy();
  });
  it('does not interpret missing backend as an all-clear home', () => {
    render(<AttentionStrip {...props} ready={false} items={[]} />);
    expect(screen.getByText(/Attention reminders are unavailable/)).toBeTruthy();
  });
  it.each(['vacuum', 'appliances', 'temperature', 'mood', 'speaker'] as const)('focuses %s locally and retains existing controls', name => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    render(
      <AttentionTarget name={name} selected={item('Bin', { target: name })} onClose={() => {}}>
        <button>Existing vacuum control</button>
      </AttentionTarget>
    );
    expect(document.activeElement?.id).toBe(`attention-target-${name}`);
    expect(screen.getByRole('button', { name: 'Existing vacuum control' })).toBeTruthy();
    expect(scroll).toHaveBeenCalled();
    expect(document.querySelector('a')).toBeNull();
  });
  it('does not replay entrance animation on mount or reconnect but animates a new event once', () => {
    const a = item('A');
    const b = item('B');
    const { rerender } = render(<AttentionStrip {...props} items={[a]} />);
    expect(document.querySelector('.attention-new')).toBeNull();
    rerender(<AttentionStrip {...props} items={[a, b]} />);
    expect(document.querySelectorAll('.attention-new')).toHaveLength(1);
    rerender(<AttentionStrip {...props} connected={false} items={[a, b]} />);
    rerender(<AttentionStrip {...props} items={[a, b, item('C')]} />);
    expect(document.querySelector('.attention-new')).toBeNull();
  });
  it('rejects malformed payloads and never accepts a navigation URL as a target', () => {
    const result = parseAttention({ items: [item('x', { target: 'https://example.com' as 'vacuum' }), { id: 'invalid' }, item('good')] });
    expect(result).toHaveLength(2);
    expect(result[0].target).toBe('details');
  });
});

// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHaFixture } from './testing/haFixture';
import { CanvasModes, CanvasModeFeedback } from './CanvasModes';
import { useCanvasModes } from './useCanvasModes';
function Surface() {
  const modes = useCanvasModes();
  return (
    <>
      <CanvasModes modes={modes} />
      <CanvasModeFeedback modes={modes} />
    </>
  );
}
const ref = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign(
    (select: (state: ReturnType<typeof createHaFixture> extends { getState: () => infer T } ? T : never) => unknown) =>
      ref.current!.useStore(select),
    {
      getState: () => ref.current!.getState(),
      subscribe: (listener: () => void) => ref.current!.subscribe(listener),
    }
  ),
}));
beforeEach(() => {
  ref.current = createHaFixture();
});
afterEach(cleanup);
it('keeps Day and Night independent', async () => {
  ref.current!.publish('input_boolean.morning_mode', 'on');
  ref.current!.publish('input_boolean.night_mode', 'off');
  render(<Surface />);
  expect(screen.getByRole('button', { name: 'Day mode' }).getAttribute('aria-pressed')).toBe('true');
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  expect((ref.current!.calls[0] as { target: { entity_id: string[] } }).target.entity_id).toEqual(['input_boolean.night_mode']);
});
it('reports service failures and leaves the independent reported states intact', async () => {
  ref.current!.publish('input_boolean.morning_mode', 'off');
  ref.current!.publish('input_boolean.night_mode', 'on');
  ref.current!.respondWith(() => Promise.reject(new Error('Mode denied')));
  render(<Surface />);
  await userEvent.click(screen.getByRole('button', { name: 'Day mode' }));
  await act(async () => {});
  expect(screen.getByRole('alert').textContent).toContain('Mode denied');
  expect(screen.getByRole('button', { name: 'Day mode' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: 'Night mode' }).getAttribute('aria-pressed')).toBe('true');
});

it.each(['Day', 'Night'])('does not turn off an active %s mode or touch the other mode', async name => {
  ref.current!.publish('input_boolean.morning_mode', 'on');
  ref.current!.publish('input_boolean.night_mode', 'on');
  render(<Surface />);
  await userEvent.click(screen.getByRole('button', { name: `${name} mode` }));
  expect(ref.current!.calls).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Day mode' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Night mode' }).getAttribute('aria-pressed')).toBe('true');
});

it('does not claim routine completion from a helper update', async () => {
  ref.current!.publish('input_boolean.morning_mode', 'on');
  ref.current!.publish('input_boolean.night_mode', 'off');
  render(<Surface />);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  expect(screen.queryByRole('status')).toBeNull();
  act(() => ref.current!.publish('input_boolean.night_mode', 'on'));
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByText('State updated.')).toBeNull();
  expect(ref.current!.calls).toHaveLength(1);
});

it('dismisses a failure without changing reported state, and shows feedback again on retry', async () => {
  ref.current!.publish('input_boolean.morning_mode', 'on');
  ref.current!.publish('input_boolean.night_mode', 'off');
  ref.current!.respondWith(() => Promise.reject(new Error('Mode denied')));
  render(<Surface />);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  expect(screen.getByRole('alert').textContent).toContain('Night: failed. Try again.');
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss Night mode message' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Night mode' }).getAttribute('aria-pressed')).toBe('false');
  expect(ref.current!.calls).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  expect(screen.getByRole('alert').textContent).toContain('Mode denied');
  expect(ref.current!.calls).toHaveLength(2);
});

// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCallback, useState } from 'react';
import { createHaFixture, deferred } from './testing/haFixture';
import { CanvasModeAlert, CanvasModeNotices, CanvasModes, CanvasModeFeedback } from './CanvasModes';
import type { OverviewNotice, ReportOverviewNotice } from './CanvasOverviewNotice';
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

function NoticeSurface() {
  const modes = useCanvasModes();
  const [notice, setNotice] = useState<OverviewNotice | null>(null);
  const reportNotice = useCallback<ReportOverviewNotice>((_, next) => setNotice(next), []);
  const [open, setOpen] = useState(false);
  const day = modes.find(mode => mode.label === 'Day')!;
  return (
    <>
      <CanvasModes modes={modes} />
      <CanvasModeFeedback modes={modes} pendingOnly />
      <CanvasModeNotices modes={modes} reportNotice={reportNotice} />
      {notice && <button onClick={() => setOpen(true)}>{notice.title}</button>}
      {open && <section role='dialog' aria-label='Day mode alert'><CanvasModeAlert mode={day} /></section>}
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
      setState: (partial: Parameters<ReturnType<typeof createHaFixture>['setState']>[0]) => ref.current!.setState(partial),
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

it('reports a failed mode command as a notice and keeps its retry and dismissal in the dialog', async () => {
  ref.current!.publish('input_boolean.morning_mode', 'off');
  ref.current!.publish('input_boolean.night_mode', 'on');
  ref.current!.respondWith(() => Promise.reject(new Error('Mode denied')));
  render(<NoticeSurface />);

  await userEvent.click(screen.getByRole('button', { name: 'Day mode' }));
  const notice = screen.getByRole('button', { name: 'Could not set Day mode' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry Day mode' })).toBeNull();
  await userEvent.click(notice);
  expect(screen.getByRole('alert').textContent).toContain('Mode denied');
  await userEvent.click(screen.getByRole('button', { name: 'Retry Day mode' }));
  expect(ref.current!.calls).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss Day mode message' }));
  expect(screen.queryByRole('button', { name: 'Could not set Day mode' })).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Day mode alert has cleared.');
});

it('requires a read-only dialog check for an unconfirmed mode and offers no retry', async () => {
  ref.current!.publish('sensor.house_mood', 'idle', { mode_control: 'coordinated-v1' });
  ref.current!.publish('input_boolean.morning_mode', 'off');
  ref.current!.publish('input_boolean.night_mode', 'on');
  ref.current!.respondWith(async message =>
    (message as { type: string }).type === 'get_states' ? Object.values(ref.current!.getState().entities) : { response: { success: true } }
  );
  render(<NoticeSurface />);

  await userEvent.click(screen.getByRole('button', { name: 'Day mode' }));
  await userEvent.click(screen.getByRole('button', { name: 'Day mode change unconfirmed' }));
  expect(screen.queryByRole('button', { name: 'Retry Day mode' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Night mode' }) as HTMLButtonElement).disabled).toBe(true);
  act(() => ref.current!.disconnect());
  const check = screen.getByRole('button', { name: 'Check Day mode status' });
  expect(check.getAttribute('aria-disabled')).toBe('true');
  await userEvent.click(check);
  expect(ref.current!.calls).toHaveLength(1);
  act(() => ref.current!.reconnect());
  await userEvent.click(screen.getByRole('button', { name: 'Check Day mode status' }));
  expect(ref.current!.calls).toHaveLength(2);
  expect(ref.current!.calls[1]).toEqual({ type: 'get_states' });
  expect((screen.getByRole('button', { name: 'Night mode' }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole('button', { name: 'Day mode change unconfirmed' })).toBeNull();
});

it.each(['before', 'after'])('hands a partially applied mode to its matching restoration sensor received %s the response', async order => {
  const fixture = ref.current!;
  const sensor = 'sensor.house_mood';
  fixture.publish(sensor, 'idle', { mode_control: 'coordinated-v1' });
  fixture.publish('input_boolean.morning_mode', 'off');
  fixture.publish('input_boolean.night_mode', 'on');
  const write = deferred();
  fixture.respondWith(() => write.promise);
  render(<NoticeSurface />);
  const day = screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement;
  const night = screen.getByRole('button', { name: 'Night mode' }) as HTMLButtonElement;
  const publishRecovery = (session: string, mode: string, modeControl: string | null = 'coordinated-v1') =>
    fixture.publish(sensor, 'recovery_required', { mode_control: modeControl, pending_mode: mode, session_id: session });

  await userEvent.click(day);
  if (order === 'before') act(() => publishRecovery('journal-day', 'day'));
  await act(async () => write.resolve({ response: {
    success: false, phase: 'recovery_required', pending_mode: 'day', session_id: 'journal-day',
    errors: [{ message: 'A mode step did not finish.' }],
  } }));
  expect(day.disabled && night.disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Could not set Day mode' })).toBeNull();

  if (order === 'after') {
    const notice = screen.getByRole('button', { name: 'Day mode restoration pending' });
    await userEvent.click(notice);
    expect(screen.getByRole('alert').textContent).toContain('A mode step did not finish.');
    expect(screen.queryByRole('button', { name: 'Retry Day mode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss Day mode message' })).toBeNull();
    act(() => publishRecovery('unrelated-journal', 'day'));
    expect(screen.getByRole('button', { name: 'Day mode restoration pending' })).toBe(notice);
    act(() => fixture.publish(sensor, 'unavailable'));
    fixture.respondWith(async () => Object.values(fixture.getState().entities).filter(entity => entity.entity_id !== sensor));
    await userEvent.click(screen.getByRole('button', { name: 'Check Day mode status' }));
    expect(day.disabled && night.disabled).toBe(true);
    expect(fixture.calls[1]).toEqual({ type: 'get_states' });
    const waitingCheck = deferred();
    fixture.respondWith(() => waitingCheck.promise);
    await userEvent.click(screen.getByRole('button', { name: 'Check Day mode status' }));
    act(() => publishRecovery('journal-day', 'day', null));
    await act(async () => waitingCheck.reject(new Error('A stale status error')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Day mode change unconfirmed' })).toBeNull();
    expect(fixture.socketListenerCount).toBe(0);
  }
  expect(screen.queryByRole('button', { name: 'Day mode restoration pending' })).toBeNull();
  expect(day.disabled && night.disabled).toBe(true);
  act(() => fixture.publish(sensor, 'idle', { mode_control: 'coordinated-v1' }));
  expect(day.disabled || night.disabled).toBe(false);
  expect(fixture.calls.filter(call => (call as { type: string }).type === 'call_service')).toHaveLength(1);
});

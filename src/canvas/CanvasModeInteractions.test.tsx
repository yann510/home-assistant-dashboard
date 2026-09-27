// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHaFixture, deferred } from './testing/haFixture';
import { CanvasModes, CanvasModeFeedback } from './CanvasModes';
import { useCanvasModes } from './useCanvasModes';
import { useHouseMood } from '../useHouseMood';
import type { MoodId } from '../moodTypes';

const ref = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({ useStore: Object.assign(
  (select: Parameters<ReturnType<typeof createHaFixture>['useStore']>[0]) => ref.current!.useStore(select),
  { getState: () => ref.current!.getState(), setState: (partial: Parameters<ReturnType<typeof createHaFixture>['setState']>[0]) => ref.current!.setState(partial), subscribe: (listener: () => void) => ref.current!.subscribe(listener) }
) }));
const moods: MoodId[] = ['love', 'unwind', 'dinner', 'party', 'gym'];
function Surface() {
  const modes = useCanvasModes();
  const mood = useHouseMood();
  return <><CanvasModes modes={modes}/><CanvasModeFeedback modes={modes}/>{moods.map(id =>
    <button key={id} onClick={() => mood.onActivate(id)}>{id}</button>)}</>;
}
function status(phase: string, active: MoodId | null = null, coordinated = true) {
  ref.current!.publish('sensor.house_mood', phase, { active_mood: active, mode_control: coordinated ? 'coordinated-v1' : undefined });
}
beforeEach(() => {
  ref.current = createHaFixture();
  ref.current.publish('input_boolean.morning_mode', 'off');
  ref.current.publish('input_boolean.night_mode', 'on');
  status('idle');
});
afterEach(cleanup);

it.each(moods)('can reapply already-on Night over %s through the coordinated service', async mood => {
  status('active', mood);
  ref.current!.respondWith(async () => ({ response: { success: true, phase: 'idle', mode_result: 'accepted' } }));
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  expect(ref.current!.calls).toEqual([{ type: 'call_service', domain: 'house_moods', service: 'apply_mode', return_response: true, service_data: { mode: 'night' } }]);
  expect(screen.queryByRole('status')).toBeNull();
});
it.each(['starting', 'restoring', 'recovery_required'])('blocks both modes during %s', async phase => {
  status(phase);
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  await userEvent.click(screen.getByRole('button', { name: 'Day mode' }));
  expect(ref.current!.calls).toEqual([]);
});
it('shares a synchronous request lock across duplicate Night and immediate Day taps', async () => {
  const request = deferred();
  ref.current!.respondWith(() => request.promise);
  render(<Surface/>);
  const night = screen.getByRole('button', { name: 'Night mode' });
  const day = screen.getByRole('button', { name: 'Day mode' });
  act(() => { night.click(); night.click(); day.click(); });
  expect(ref.current!.calls).toHaveLength(1);
  act(() => {
    ref.current!.publish('input_boolean.morning_mode', 'on');
    ref.current!.publish('input_boolean.night_mode', 'off');
  });
  expect((day as HTMLButtonElement).disabled).toBe(true);
  await act(async () => request.resolve({ response: { success: true, mode_result: 'accepted' } }));
  expect(screen.queryByRole('status')).toBeNull();
});
it.each(moods)('blocks unsafe legacy mode writes over %s', async mood => {
  status('active', mood, false);
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Day mode' }));
  expect(ref.current!.calls).toEqual([]);
});
it('requires both mode helpers and a connection', async () => {
  ref.current!.publish('input_boolean.morning_mode', 'unavailable');
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  act(() => {
    ref.current!.publish('input_boolean.morning_mode', 'off');
    ref.current!.disconnect();
  });
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  expect(ref.current!.calls).toEqual([]);
});
it('routes conflicting helpers through a coordinated routine instead of assuming completion', async () => {
  ref.current!.publish('input_boolean.morning_mode', 'on');
  ref.current!.respondWith(async () => ({ response: { success: false, errors: [{ message: 'Resolve recovery' }] } }));
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  expect(screen.getByRole('alert').textContent).toContain('Resolve recovery');
  expect(screen.getByRole('button', { name: 'Day mode' }).getAttribute('aria-pressed')).toBe('true');
});
it.each(moods.flatMap(mood => ['day', 'night'].map(mode => ({ mood, mode }))))('activates $mood in steady $mode without changing helpers', async ({ mood, mode }) => {
  ref.current!.publish('input_boolean.morning_mode', mode === 'day' ? 'on' : 'off');
  ref.current!.publish('input_boolean.night_mode', mode === 'night' ? 'on' : 'off');
  ref.current!.respondWith(async () => ({ response: { success: true, phase: 'active', active_mood: mood } }));
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: mood }));
  expect(ref.current!.calls).toEqual([{ type: 'call_service', domain: 'house_moods', service: 'activate', return_response: true, service_data: { mood } }]);
  expect(ref.current!.getState().entities['input_boolean.night_mode'].state).toBe(mode === 'night' ? 'on' : 'off');
});

it('invalidates a pending mode request on same-socket reconnect and ignores its late response', async () => {
  const request = deferred();
  ref.current!.respondWith(() => request.promise);
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  act(() => { ref.current!.socketDisconnect(); ref.current!.socketReconnect(); });
  expect(screen.getByRole('alert').textContent).toContain('Connection changed');
  await act(async () => request.resolve({ response: { success: true, mode_result: 'accepted' } }));
  expect(screen.getByRole('alert').textContent).toContain('Connection changed');
  await userEvent.click(screen.getByRole('button', { name: 'Day mode' }));
  expect(ref.current!.calls).toHaveLength(1);
  expect(ref.current!.socketListenerCount).toBe(0);
});
it('removes pending listeners on unmount and ignores its late response', async () => {
  const request = deferred();
  ref.current!.respondWith(() => request.promise);
  const view = render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  view.unmount();
  expect(ref.current!.socketListenerCount).toBe(0);
  expect(ref.current!.listenerCount).toBe(0);
  await act(async () => request.resolve({ response: { success: true, mode_result: 'accepted' } }));
  expect(ref.current!.calls).toHaveLength(1);
});

it('checks fresh terminal status after a lost response and ignores the old acknowledgement', async () => {
  const request = deferred();
  ref.current!.respondWith(() => request.promise);
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  act(() => { ref.current!.socketDisconnect(); ref.current!.socketReconnect(); status('idle'); });
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(true);
  ref.current!.respondWith(async message => {
    expect(message).toEqual({ type: 'get_states' });
    return Object.values(ref.current!.getState().entities);
  });
  await userEvent.click(screen.getByRole('button', { name: 'Check Night mode status' }));
  await act(async () => request.resolve({ response: { success: true, mode_result: 'accepted' } }));
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(false);
  expect(ref.current!.calls).toHaveLength(2);
});

it('keeps the status check available after a failed fetch and after dismissing feedback', async () => {
  const request = deferred();
  ref.current!.respondWith(() => request.promise);
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  act(() => { ref.current!.socketDisconnect(); ref.current!.socketReconnect(); });
  ref.current!.respondWith(() => Promise.reject(new Error('Status unavailable')));
  await userEvent.click(screen.getByRole('button', { name: 'Check Night mode status' }));
  expect(screen.getByRole('alert').textContent).toContain('Status unavailable');
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss Night mode message' }));
  expect(screen.getByRole('button', { name: 'Check Night mode status' })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(true);
  ref.current!.respondWith(async message => {
    expect(message).toEqual({ type: 'get_states' });
    return Object.values(ref.current!.getState().entities);
  });
  await userEvent.click(screen.getByRole('button', { name: 'Check Night mode status' }));
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(false);
});

it('keeps controls disabled when a fresh check reports backend recovery', async () => {
  const request = deferred();
  ref.current!.respondWith(() => request.promise);
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  act(() => { ref.current!.socketDisconnect(); ref.current!.socketReconnect(); status('recovery_required'); });
  ref.current!.respondWith(async () => Object.values(ref.current!.getState().entities));
  await userEvent.click(screen.getByRole('button', { name: 'Check Night mode status' }));
  expect(screen.queryByRole('button', { name: 'Check Night mode status' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(true);
});

it('reconciles legacy modes from fresh idle status', async () => {
  status('idle', null, false);
  const request = deferred();
  ref.current!.respondWith(() => request.promise);
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Day mode' }));
  act(() => { ref.current!.socketDisconnect(); ref.current!.socketReconnect(); });
  ref.current!.respondWith(async () => Object.values(ref.current!.getState().entities));
  await userEvent.click(screen.getByRole('button', { name: 'Check Day mode status' }));
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(false);
});

it('keeps an unconfirmed coordinated response locked until a read-only check', async () => {
  ref.current!.respondWith(async () => ({ response: { success: true } }));
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(true);
  ref.current!.respondWith(async () => Object.values(ref.current!.getState().entities));
  await userEvent.click(screen.getByRole('button', { name: 'Check Night mode status' }));
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(false);
  expect(ref.current!.calls).toHaveLength(2);
});

it('offers a status check after a request timeout without sending another mode command', async () => {
  vi.useFakeTimers();
  try {
    ref.current!.respondWith(() => new Promise(() => {}));
    render(<Surface/>);
    act(() => { screen.getByRole('button', { name: 'Night mode' }).click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(35000); });
    expect(screen.getByRole('button', { name: 'Check Night mode status' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(true);
    expect(ref.current!.calls).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});

it('removes status-check listeners when the mode surface unmounts', async () => {
  ref.current!.respondWith(async () => ({ response: { success: true } }));
  const view = render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  ref.current!.respondWith(() => new Promise(() => {}));
  await userEvent.click(screen.getByRole('button', { name: 'Check Night mode status' }));
  expect(ref.current!.socketListenerCount).toBe(2);
  view.unmount();
  expect(ref.current!.socketListenerCount).toBe(0);
  await act(async () => {});
});

it('uses fetched mode state when cached helpers disagree', async () => {
  ref.current!.respondWith(async () => ({ response: { success: true } }));
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  expect(screen.getByRole('button', { name: 'Night mode' }).getAttribute('aria-pressed')).toBe('true');
  ref.current!.respondWith(async () => Object.values(ref.current!.getState().entities).map(entity =>
    entity.entity_id === 'input_boolean.night_mode' ? { ...entity, state: 'off' } :
    entity.entity_id === 'input_boolean.morning_mode' ? { ...entity, state: 'on' } : entity
  ));
  await userEvent.click(screen.getByRole('button', { name: 'Check Night mode status' }));
  expect(screen.getByRole('button', { name: 'Night mode' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: 'Day mode' }).getAttribute('aria-pressed')).toBe('true');
  expect(ref.current!.calls).toHaveLength(2);
});

it('keeps the lock when the same socket reconnects during a status check', async () => {
  ref.current!.respondWith(async () => ({ response: { success: true } }));
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  const check = deferred();
  ref.current!.respondWith(() => check.promise);
  await userEvent.click(screen.getByRole('button', { name: 'Check Night mode status' }));
  act(() => { ref.current!.socketDisconnect(); ref.current!.socketReconnect(); });
  await act(async () => check.resolve(Object.values(ref.current!.getState().entities)));
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('Connection changed');
  expect(screen.getByRole('button', { name: 'Check Night mode status' })).toBeTruthy();
});

it('deduplicates status taps while a check is pending', async () => {
  ref.current!.respondWith(async () => ({ response: { success: true } }));
  render(<Surface/>);
  await userEvent.click(screen.getByRole('button', { name: 'Night mode' }));
  const check = deferred();
  ref.current!.respondWith(() => check.promise);
  const button = screen.getByRole('button', { name: 'Check Night mode status' });
  act(() => { button.click(); button.click(); });
  expect(ref.current!.calls).toHaveLength(2);
  await act(async () => check.resolve(Object.values(ref.current!.getState().entities)));
  expect((screen.getByRole('button', { name: 'Day mode' }) as HTMLButtonElement).disabled).toBe(false);
});

// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';
import { useSpotifyTrackSaved } from './useSpotifyTrackSaved';
const A = 'spotify:track:0000000000000000000001';
const B = 'spotify:track:0000000000000000000002';
const send = vi.fn();
let events: Map<string, Set<() => void>>;
function emit(name: string) {
  for (const fn of events.get(name) ?? []) fn();
}
beforeEach(() => {
  events = new Map();
  send.mockReset().mockImplementation(async message => ({ track_uri: message.track_uri, saved: message.saved ?? false }));
  useStore.setState({
    connectionStatus: 'connected',
    connection: {
      connected: true,
      sendMessagePromise: send,
      addEventListener: (name: string, fn: () => void) => {
        if (!events.has(name)) events.set(name, new Set());
        events.get(name)!.add(fn);
      },
      removeEventListener: (name: string, fn: () => void) => events.get(name)?.delete(fn),
    } as unknown as Connection,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('keeps unknown loading distinct from unsaved, validates identity and uses authenticated explicit desired-state writes', async () => {
  let finish!: (value: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const { result, rerender } = renderHook(({ uri, enabled }) => useSpotifyTrackSaved(uri, enabled), {
    initialProps: { uri: A, enabled: true },
  });
  expect(result.current.saved).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => finish({ track_uri: A, saved: false }));
  await act(async () => {
    expect(await result.current.setSaved(true)).toBe(true);
  });
  expect(result.current.saved).toBe(true);
  expect(send).toHaveBeenLastCalledWith({ type: 'dashboard_music/set_track_saved', track_uri: A, saved: true });
  rerender({ uri: 'spotify:episode:0000000000000000000001', enabled: true });
  expect(result.current.saved).toBeNull();
  await act(async () => {
    expect(await result.current.setSaved(true)).toBe(false);
  });
  expect(send).toHaveBeenCalledTimes(2);
  rerender({ uri: B, enabled: false });
  expect(result.current.saved).toBeNull();
  expect(send).toHaveBeenCalledTimes(2);
});
it('locks rapid taps and captures A while a late write cannot modify B', async () => {
  const { result, rerender } = renderHook(({ uri }) => useSpotifyTrackSaved(uri, true), { initialProps: { uri: A } });
  await waitFor(() => expect(result.current.saved).toBe(false));
  let finish!: (value: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  let write!: Promise<boolean>;
  act(() => {
    write = result.current.setSaved(true);
    void result.current.setSaved(true);
  });
  expect(result.current.pending).toBe(true);
  expect(send.mock.calls.filter(([message]) => message.type.endsWith('/set_track_saved'))).toHaveLength(1);
  rerender({ uri: B });
  expect(result.current.saved).toBeNull();
  expect(result.current.pending).toBe(false);
  await waitFor(() => expect(result.current.saved).toBe(false));
  await act(async () => {
    finish({ track_uri: A, saved: true });
    expect(await write).toBe(false);
  });
  expect(result.current.saved).toBe(false);
  expect(send.mock.calls[1][0]).toEqual({ type: 'dashboard_music/set_track_saved', track_uri: A, saved: true });
});
it('treats failed writes as uncertain and retry reads before allowing any later write', async () => {
  const { result } = renderHook(() => useSpotifyTrackSaved(A, true));
  await waitFor(() => expect(result.current.saved).toBe(false));
  send.mockRejectedValueOnce({ code: 'auth_required' });
  await act(async () => {
    expect(await result.current.setSaved(true)).toBe(false);
  });
  expect(result.current.saved).toBeNull();
  expect(result.current.error).toContain('reconnected');
  await act(async () => {
    expect(await result.current.setSaved(true)).toBe(false);
  });
  send.mockResolvedValueOnce({ track_uri: A, saved: true });
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.saved).toBe(true));
  expect(send).toHaveBeenLastCalledWith({ type: 'dashboard_music/track_saved', track_uri: A });
  expect(send.mock.calls.filter(([message]) => message.type.endsWith('/set_track_saved'))).toHaveLength(1);
});
it('polls visible tracks after 30 seconds, deduplicates focus and refreshes on visibility and reconnect without replaying writes', async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const { result } = renderHook(() => useSpotifyTrackSaved(A, true));
  await act(async () => {});
  send.mockResolvedValueOnce({ track_uri: A, saved: true });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
    window.dispatchEvent(new Event('focus'));
  });
  expect(result.current.saved).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
  visibility.mockReturnValue('hidden');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(send).toHaveBeenCalledTimes(2);
  visibility.mockReturnValue('visible');
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  expect(send).toHaveBeenCalledTimes(3);
  const socket = useStore.getState().connection!;
  act(() => {
    Object.assign(socket, { connected: false });
    emit('disconnected');
  });
  expect(result.current.saved).toBeNull();
  await act(async () => {
    Object.assign(socket, { connected: true });
    emit('ready');
  });
  expect(send).toHaveBeenCalledTimes(4);
  expect(send.mock.calls.every(([message]) => message.type === 'dashboard_music/track_saved')).toBe(true);
});
it('rejects mismatched responses and cancels timed-out/unmounted reads', async () => {
  vi.useFakeTimers();
  send.mockReturnValue(new Promise(() => {}));
  const { result, unmount } = renderHook(() => useSpotifyTrackSaved(A, true));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(result.current.loading).toBe(false);
  expect(result.current.saved).toBeNull();
  expect(result.current.error).toBeTruthy();
  send.mockResolvedValueOnce({ track_uri: B, saved: true });
  await act(async () => result.current.retry());
  expect(result.current.saved).toBeNull();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('reconciles an interrupted write with a fresh read and ignores both pre-disconnect read and write responses', async () => {
  const { result } = renderHook(() => useSpotifyTrackSaved(A, true));
  await waitFor(() => expect(result.current.saved).toBe(false));
  let finish!: (value: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  let write!: Promise<boolean>;
  act(() => {
    write = result.current.setSaved(true);
  });
  const socket = useStore.getState().connection!;
  act(() => {
    Object.assign(socket, { connected: false });
    emit('disconnected');
  });
  expect(result.current.pending).toBe(false);
  expect(result.current.saved).toBeNull();
  send.mockResolvedValueOnce({ track_uri: A, saved: true });
  await act(async () => {
    Object.assign(socket, { connected: true });
    emit('ready');
  });
  expect(result.current.saved).toBe(true);
  await act(async () => {
    finish({ track_uri: A, saved: false });
    expect(await write).toBe(false);
  });
  expect(result.current.saved).toBe(true);
  expect(send.mock.calls.map(([message]) => message.type)).toEqual([
    'dashboard_music/track_saved',
    'dashboard_music/set_track_saved',
    'dashboard_music/track_saved',
  ]);
});
it('polls at the next 30-second tick even if the initial network read completed later', async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const { result } = renderHook(() => useSpotifyTrackSaved(A, true));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
    finish({ track_uri: A, saved: false });
  });
  send.mockResolvedValueOnce({ track_uri: A, saved: true });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(29000);
  });
  expect(result.current.saved).toBe(true);
});

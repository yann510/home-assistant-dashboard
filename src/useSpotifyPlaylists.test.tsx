// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';
import { useSpotifyPlaylists } from './useSpotifyPlaylists';

const send = vi.fn();
const playlist = (id: string, title = 'Private collection') => ({ uri: `spotify:playlist:${id.padStart(22, '0')}`, title, owner: 'Yann' });
const page = (items = [playlist('1')], nextOffset: number | null = null) => ({ items, nextOffset, total: 2 });
let events: Map<string, () => void>;
beforeEach(() => {
  events = new Map();
  send.mockReset().mockResolvedValue(page());
  useStore.setState({
    connectionStatus: 'connected',
    connection: {
      connected: true,
      sendMessagePromise: send,
      addEventListener: (event: string, fn: () => void) => events.set(event, fn),
      removeEventListener: (event: string) => events.delete(event),
    } as unknown as Connection,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('uses the authenticated fixed-account library with 50-item pages and exact URI deduplication', async () => {
  send.mockResolvedValueOnce(page([playlist('1')], 50)).mockResolvedValueOnce(page([playlist('1'), playlist('2')]));
  const { result } = renderHook(() => useSpotifyPlaylists(true));
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'dashboard_music/playlists', offset: 0, limit: 50 });
  act(() => {
    result.current.loadMore();
    result.current.loadMore();
  });
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  expect(result.current.items.map(item => item.uri)).toEqual([playlist('1').uri, playlist('2').uri]);
  expect(send).toHaveBeenLastCalledWith({ type: 'dashboard_music/playlists', offset: 50, limit: 50 });
  expect(result.current.hasMore).toBe(false);
});
it('keeps earlier pages and retries only the failed next page after rate limiting', async () => {
  send
    .mockResolvedValueOnce(page([playlist('1')], 50))
    .mockRejectedValueOnce({ code: 'rate_limited', message: 'Slow down', retry_after: 5 })
    .mockResolvedValueOnce(page([playlist('2')]));
  const { result } = renderHook(() => useSpotifyPlaylists(true));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.error).toContain('5'));
  expect(result.current.items).toEqual([playlist('1')]);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  expect(send).toHaveBeenLastCalledWith({ type: 'dashboard_music/playlists', offset: 50, limit: 50 });
});
it('ignores old responses after close and refresh, and refreshes stale pages when reopened', async () => {
  let old!: (value: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        old = resolve;
      })
  );
  const { result, rerender } = renderHook(({ enabled }) => useSpotifyPlaylists(enabled), { initialProps: { enabled: true } });
  rerender({ enabled: false });
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.items).toEqual([playlist('1')]));
  await act(async () => old(page([playlist('9')])));
  expect(result.current.items).toEqual([playlist('1')]);
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
  rerender({ enabled: false });
  rerender({ enabled: true });
  await waitFor(() => expect(send).toHaveBeenLastCalledWith({ type: 'dashboard_music/playlists', offset: 0, limit: 50, refresh: true }));
  vi.restoreAllMocks();
});
it('reconciles an in-place socket reconnect without accepting a pre-disconnect response', async () => {
  let old!: (value: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        old = resolve;
      })
  );
  const { result } = renderHook(() => useSpotifyPlaylists(true));
  const socket = useStore.getState().connection!;
  act(() => {
    Object.assign(socket, { connected: false });
    events.get('disconnected')?.();
  });
  expect(result.current.loading).toBe(false);
  act(() => {
    Object.assign(socket, { connected: true });
    events.get('ready')?.();
  });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  await act(async () => old(page([playlist('9')])));
  expect(result.current.items).toEqual([playlist('1')]);
});
it('refreshes explicitly and does not request while disabled or disconnected', async () => {
  const { result, rerender } = renderHook(({ enabled }) => useSpotifyPlaylists(enabled), { initialProps: { enabled: false } });
  act(() => result.current.loadMore());
  expect(send).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  act(() => result.current.refresh());
  await waitFor(() => expect(send).toHaveBeenLastCalledWith({ type: 'dashboard_music/playlists', offset: 0, limit: 50, refresh: true }));
});
it('releases canceled page/refresh loading states when reopened with fresh cached choices', async () => {
  send.mockResolvedValueOnce(page([playlist('1')], 50)).mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender } = renderHook(({ enabled }) => useSpotifyPlaylists(enabled), { initialProps: { enabled: true } });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  act(() => result.current.loadMore());
  expect(result.current.loadingMore).toBe(true);
  rerender({ enabled: false });
  rerender({ enabled: true });
  expect(result.current.loadingMore).toBe(false);
  expect(result.current.items).toEqual([playlist('1')]);
  send.mockReturnValueOnce(new Promise(() => {}));
  act(() => result.current.refresh());
  expect(result.current.loading).toBe(true);
  rerender({ enabled: false });
  rerender({ enabled: true });
  expect(result.current.loading).toBe(false);
  expect(result.current.items).toEqual([playlist('1')]);
});

// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';
import { useSpotifyPlaylistPlayback } from './useSpotifyPlaylistPlayback';
const item = { uri: 'spotify:playlist:1234567890123456789012', title: 'Private jazz', owner: 'Yann' };
const send = vi.fn();
let disconnect: () => void;
function response(status = 'confirmed', changes = {}) {
  const data = send.mock.calls[send.mock.calls.length - 1][0].service_data;
  return { context: {}, response: { ...data, status, ...changes } };
}
beforeEach(() => {
  send.mockReset().mockImplementation(async () => response());
  useStore.setState({
    connectionStatus: 'connected',
    connection: {
      connected: true,
      sendMessagePromise: send,
      addEventListener: (_event: string, fn: () => void) => {
        disconnect = fn;
      },
      removeEventListener() {},
    } as unknown as Connection,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(['confirmed', 'already_playing'])(
  'accepts authenticated response.%s and sends one stable ID per attempt even on HTTP without randomUUID',
  async status => {
    vi.stubGlobal('crypto', { randomUUID: undefined });
    let finish!: (value: unknown) => void;
    send.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const { result } = renderHook(() => useSpotifyPlaylistPlayback('media_player.gym', false));
    let start!: Promise<boolean>;
    act(() => {
      start = result.current.play(item);
    });
    await act(async () => expect(await result.current.play(item)).toBe(false));
    expect(result.current.pending).toEqual(item);
    const request = send.mock.calls[0][0];
    expect(request).toEqual({
      type: 'call_service',
      domain: 'dashboard_music',
      service: 'play_spotify',
      return_response: true,
      service_data: { playlist_uri: item.uri, source_entity: 'media_player.gym', request_id: expect.any(String) },
    });
    expect(request.service_data.request_id).toMatch(/^dashboard-/);
    expect(request.service_data.request_id.length).toBeGreaterThan(10);
    await act(async () => {
      finish(response(status));
      expect(await start).toBe(true);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
  }
);
it.each(['busy', 'failed', 'unconfirmed'])('keeps %s uncertain or failed without automatically replaying', async status => {
  send.mockImplementationOnce(async () => response(status, { message: 'Check Spotify before trying again.' }));
  const { result } = renderHook(() => useSpotifyPlaylistPlayback('media_player.gym', false));
  await act(async () => expect(await result.current.play(item)).toBe(false));
  expect(result.current.error).toContain('Check Spotify');
  expect(send).toHaveBeenCalledTimes(1);
});
it.each(['request_id', 'playlist_uri', 'source_entity'])('rejects a mismatched echoed %s', async field => {
  send.mockImplementationOnce(async () => response('confirmed', { [field]: 'other' }));
  const { result } = renderHook(() => useSpotifyPlaylistPlayback('media_player.gym', false));
  await act(async () => expect(await result.current.play(item)).toBe(false));
  expect(result.current.error).toContain('could not be confirmed');
});
it.each(['source', 'disconnect', 'unmount'])('invalidates a pending response on %s', async mode => {
  let finish!: (value: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const { result, rerender, unmount } = renderHook(({ source }) => useSpotifyPlaylistPlayback(source, false), {
    initialProps: { source: 'media_player.gym' },
  });
  let start!: Promise<boolean>;
  act(() => {
    start = result.current.play(item);
  });
  if (mode === 'source') rerender({ source: 'media_player.bedroom' });
  if (mode === 'disconnect') act(() => disconnect());
  if (mode === 'unmount') unmount();
  await act(async () => {
    finish(response());
    expect(await start).toBe(false);
  });
});
it('times out after 35 seconds with uncertainty and never retries in the background', async () => {
  vi.useFakeTimers();
  send.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useSpotifyPlaylistPlayback('media_player.gym', false));
  let start!: Promise<boolean>;
  act(() => {
    start = result.current.play(item);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(35000);
    expect(await start).toBe(false);
  });
  expect(result.current.error).toContain('could not be confirmed');
  expect(result.current.pending).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100000);
  });
  expect(send).toHaveBeenCalledTimes(1);
});
it('blocks disabled, disconnected and invalid playlist starts, including a retained callback', async () => {
  const { result, rerender } = renderHook(({ disabled }) => useSpotifyPlaylistPlayback('media_player.gym', disabled), {
    initialProps: { disabled: false },
  });
  const retained = result.current.play;
  rerender({ disabled: true });
  await act(async () => expect(await retained(item)).toBe(false));
  rerender({ disabled: false });
  await act(async () => expect(await result.current.play({ ...item, uri: 'spotify:track:1234567890123456789012' })).toBe(false));
  act(() => useStore.setState({ connectionStatus: 'disconnected' }));
  await act(async () => expect(await result.current.play(item)).toBe(false));
  expect(send).not.toHaveBeenCalled();
});

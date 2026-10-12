// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';
import { spotifyEnqueue, useListening } from './useListening';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const id = '1234567890123456789012';
const item = { title: 'Song', media_content_id: `spotify://account/spotify:track:${id}`, media_content_type: 'music', can_play: true };
function socket(
  send = vi.fn(async (m: { type: string }) =>
    m.type === 'get_services'
      ? { sonos: { get_queue: {} }, media_player: { shuffle_set: {}, repeat_set: {}, play_media: {} } }
      : { response: { room: [{ title: 'Actual', artist: 'Artist', album: 'Album', media_content_id: 'actual' }] } }
  )
) {
  const listeners = new Map<string, Set<() => void>>();
  useStore.setState({
    connection: {
      connected: true,
      sendMessagePromise: send,
      addEventListener: (k: string, fn: () => void) => listeners.set(k, new Set([...(listeners.get(k) ?? []), fn])),
      removeEventListener: (k: string, fn: () => void) => listeners.get(k)?.delete(fn),
    } as unknown as Connection,
    connectionStatus: 'connected',
  });
  return {
    send,
    disconnect: () => listeners.get('disconnected')?.forEach(fn => fn()),
    ready: () => [...(listeners.get('ready') ?? [])].forEach(fn => fn()),
  };
}
it('only normalizes playable Spotify track/album/playlist URIs and preserves media type', () => {
  expect(spotifyEnqueue(item)).toEqual({ media_content_id: `spotify:track:${id}`, media_content_type: 'music' });
  expect(spotifyEnqueue({ ...item, media_content_id: 'favorite:1' })).toBeNull();
  expect(spotifyEnqueue({ ...item, media_content_id: 'spotify:track:short' })).toBeNull();
  expect(
    spotifyEnqueue({ ...item, media_content_type: 'spotify://playlist', media_content_id: `spotify:playlist:${id}` })?.media_content_type
  ).toBe('playlist');
});
it('reads the direct entity array via authenticated response-returning Sonos service', async () => {
  const { send } = socket();
  const { result } = renderHook(() => useListening('room', true, 2097152, () => false));
  await waitFor(() => expect(result.current.canQueue).toBe(true));
  await act(() => result.current.refresh());
  expect(result.current.items[0].title).toBe('Actual');
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ domain: 'sonos', service: 'get_queue', return_response: true, target: { entity_id: 'room' } })
  );
});
it('blocks duplicate mutations, unsafe favourites, blocked actions and retained source callbacks', async () => {
  const { send } = socket();
  const { result, rerender } = renderHook(({ source, blocked }) => useListening(source, true, 2097152, () => blocked), {
    initialProps: { source: 'room', blocked: false },
  });
  await waitFor(() => expect(result.current.canEnqueue).toBe(true));
  const retained = result.current.enqueue;
  rerender({ source: 'other', blocked: false });
  await act(() => retained(item, 'next'));
  expect(send.mock.calls.filter(([m]) => m.type === 'call_service')).toHaveLength(0);
  rerender({ source: 'other', blocked: true });
  await act(() => result.current.enqueue(item, 'add'));
  expect(send.mock.calls.filter(([m]) => m.type === 'call_service')).toHaveLength(0);
});
it('discards late queue responses after source changes and in-place disconnects', async () => {
  let resolve!: (x: unknown) => void;
  const send = vi.fn((m: { type: string }) =>
    m.type === 'get_services'
      ? Promise.resolve({ sonos: { get_queue: {} } })
      : new Promise(r => {
          resolve = r;
        })
  );
  const { disconnect } = socket(send as never);
  const { result, rerender } = renderHook(({ source }) => useListening(source, true, 0, () => false), { initialProps: { source: 'room' } });
  await waitFor(() => expect(result.current.canQueue).toBe(true));
  let request!: Promise<void>;
  act(() => {
    request = result.current.refresh();
  });
  rerender({ source: 'other' });
  resolve({ response: { room: [{ title: 'Stale' }] } });
  await act(() => request);
  expect(result.current.items).toEqual([]);
  await waitFor(() => expect(result.current.canQueue).toBe(true));
  act(() => {
    request = result.current.refresh();
  });
  expect(send.mock.calls.filter(([m]) => m.type === 'call_service')).toHaveLength(2);
  act(disconnect);
  resolve({ response: { other: [{ title: 'Stale' }] } });
  await act(() => request);
  expect(result.current.items).toEqual([]);
});
it('rechecks capabilities for retained callbacks and reports successful enqueue without replacing playback', async () => {
  const { send } = socket();
  const { result, rerender } = renderHook(({ features }) => useListening('room', true, features, () => false), {
    initialProps: { features: 2097152 | 32768 | 262144 },
  });
  await waitFor(() => expect(result.current.canEnqueue).toBe(true));
  const { enqueue, shuffle, repeat } = result.current;
  rerender({ features: 0 });
  await act(async () => {
    await enqueue(item, 'next');
    await shuffle(true);
    await repeat('all');
  });
  expect(send.mock.calls.filter(([m]) => m.type === 'call_service')).toHaveLength(0);
  rerender({ features: 2097152 });
  await act(() => result.current.enqueue(item, 'next'));
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      service: 'play_media',
      service_data: { media_content_id: `spotify:track:${id}`, media_content_type: 'music', enqueue: 'next' },
    })
  );
  expect(result.current.mutationStatus).toBe('Song will play next.');
});
it('reports queue failures and malformed responses separately from mutation failures', async () => {
  const { send } = socket();
  const { result } = renderHook(() => useListening('room', true, 2097152, () => false));
  await waitFor(() => expect(result.current.canQueue).toBe(true));
  send.mockRejectedValueOnce(new Error('Read failed'));
  await act(() => result.current.refresh());
  expect(result.current.queueError).toContain('Read failed');
  expect(result.current.loaded).toBe(false);
  send.mockResolvedValueOnce({ response: { room: { queue: [] } } } as never);
  await act(() => result.current.refresh());
  expect(result.current.queueError).toContain('unsupported queue response');
  send.mockRejectedValueOnce(new Error('Write failed'));
  await act(() => result.current.enqueue(item, 'add'));
  expect(result.current.mutationError).toContain('Write failed');
  expect(result.current.mutationStatus).toBe('');
});
it('acquires a shared mutation lock synchronously and releases it on failure', async () => {
  const { send } = socket();
  const shared = { current: false };
  const { result } = renderHook(() => useListening('room', true, 2097152, () => false, undefined, shared));
  await waitFor(() => expect(result.current.canEnqueue).toBe(true));
  let reject!: (e: Error) => void;
  send.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  );
  let first!: Promise<boolean>;
  act(() => {
    first = result.current.enqueue(item, 'next');
  });
  expect(shared.current).toBe(true);
  await act(() => result.current.enqueue(item, 'add'));
  expect(send.mock.calls.filter(([m]) => m.type === 'call_service')).toHaveLength(1);
  await act(async () => {
    reject(new Error('Write failed'));
    await first;
  });
  expect(shared.current).toBe(false);
});
it('rediscovers services on an event-only same-socket reconnect without replaying mutations', async () => {
  const { send, disconnect, ready } = socket();
  const { result } = renderHook(() => useListening('room', true, 2097152, () => false));
  await waitFor(() => expect(result.current.canEnqueue).toBe(true));
  const retained = result.current.enqueue;
  act(disconnect);
  expect(result.current.canEnqueue).toBe(false);
  act(ready);
  await waitFor(() => expect(result.current.canEnqueue).toBe(true));
  await act(() => retained(item, 'add'));
  expect(send.mock.calls.filter(([m]) => m.type === 'call_service')).toHaveLength(0);
  await act(() => result.current.enqueue(item, 'add'));
  expect(send.mock.calls.filter(([m]) => m.type === 'call_service')).toHaveLength(1);
});

it('can mutate under the application StrictMode setup-cleanup-setup lifecycle', async () => {
  const { send } = socket();
  const { result } = renderHook(() => useListening('room', true, 2097152, () => false), { wrapper: StrictMode });
  await waitFor(() => expect(result.current.canEnqueue).toBe(true));
  await act(() => result.current.enqueue(item, 'add'));
  expect(send.mock.calls.filter(([m]) => m.type === 'call_service')).toHaveLength(1);
});

it('reports a bounded service discovery failure and keeps queue contents unknown', async () => {
  vi.useFakeTimers();
  socket(vi.fn(() => new Promise(() => {})) as never);
  const { result } = renderHook(() => useListening('room', true, 0, () => false));
  await act(() => vi.advanceTimersByTimeAsync(15000));
  expect(result.current.queueError).toContain('Could not discover speaker services');
  expect(result.current.loaded).toBe(false);
  expect(result.current.canQueue).toBe(false);
});

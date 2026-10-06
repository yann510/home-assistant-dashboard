// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHaFixture, deferred } from './canvas/testing/haFixture';
import { useSpeakerFavouritePlayback } from './useSpeakerFavouritePlayback';
const ref = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign((select: (state: unknown) => unknown) => ref.current!.useStore(select), {
    getState: () => ref.current!.getState(),
    subscribe: (listener: (state: unknown) => void) => ref.current!.subscribe(() => listener(ref.current!.getState())),
  }),
}));
const source = 'media_player.living_room';
const item = { title: 'Evening jazz', media_content_id: 'jazz', media_content_type: 'playlist' };
let fixture: ReturnType<typeof createHaFixture>;
beforeEach(() => {
  fixture = createHaFixture();
  ref.current = fixture;
  fixture.publish(source, 'playing', { media_content_id: 'track-1', media_title: 'Old track' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const mount = () => {
  const close = vi.fn();
  return {
    ...renderHook(({ id = source, disabled = false }) => useSpeakerFavouritePlayback(id, disabled, close), {
      initialProps: { id: source, disabled: false },
    }),
    close,
  };
};
it('does not restart an exact meaningful playing favourite and closes with clear status', async () => {
  fixture.publish(source, 'playing', { media_content_id: 'jazz' });
  const { result, close } = mount();
  await act(async () => expect(await result.current.play(item)).toBe(true));
  expect(fixture.calls).toHaveLength(0);
  expect(close).toHaveBeenCalledOnce();
  expect(result.current.playStatus).toBe('Already playing Evening jazz.');
});
it.each(['paused', 'playing'])('sends for %s media even when title matches, then closes only after observed change', async state => {
  fixture.publish(source, state, { media_content_id: state === 'paused' ? 'jazz' : 'other', media_title: item.title });
  const { result, close } = mount();
  let playback: Promise<boolean>;
  act(() => {
    playback = result.current.play(item);
  });
  expect(fixture.calls).toHaveLength(1);
  expect(close).not.toHaveBeenCalled();
  await act(async () => {
    fixture.publish(source, 'playing', { media_content_id: 'jazz-track', media_title: 'New track' });
    await playback;
  });
  expect(close).toHaveBeenCalledOnce();
});
it('remembers an observed selection only while source and playback identity match', async () => {
  const { result, close } = mount();
  let playback: Promise<boolean>;
  act(() => {
    playback = result.current.play(item);
  });
  await act(async () => {
    fixture.publish(source, 'playing', { media_content_id: 'jazz-track', media_title: 'New track' });
    await playback;
  });
  await act(async () => {
    await result.current.play(item);
  });
  expect(fixture.calls).toHaveLength(1);
  expect(close).toHaveBeenCalledTimes(2);
  act(() => {
    fixture.publish(source, 'playing', { media_content_id: 'different-track' });
    playback = result.current.play(item);
  });
  expect(fixture.calls).toHaveLength(2);
  await act(async () => {
    fixture.publish(source, 'playing', { media_content_id: 'next-track' });
    await playback;
  });
});
it('keeps acknowledged unchanged playing metadata neutral and retryable without remembering it', async () => {
  vi.useFakeTimers();
  const { result, close } = mount();
  let playback: Promise<boolean>;
  act(() => {
    playback = result.current.play(item);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
    await playback;
  });
  expect(result.current.playError).toBe('');
  expect(result.current.playStatus).toContain('Request accepted');
  expect(result.current.pending).toBeNull();
  expect(close).not.toHaveBeenCalled();
  act(() => {
    playback = result.current.play(item);
  });
  expect(fixture.calls).toHaveLength(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
    await playback;
  });
});
it('keeps real rejection and offline attempts honest', async () => {
  fixture.respondWith(() => Promise.reject(new Error('Speaker offline')));
  const { result, close } = mount();
  await act(async () => {
    await result.current.play(item);
  });
  expect(result.current.commandError).toContain('Speaker offline');
  expect(close).not.toHaveBeenCalled();
  fixture.disconnect();
  fixture.publish(source, 'playing', { media_content_id: 'jazz' });
  await act(async () => {
    await result.current.play(item);
  });
  expect(fixture.calls).toHaveLength(1);
  expect(result.current.commandError).toContain('Reconnecting');
});
it('reports disconnect after acknowledgement as an error and ignores a stale source result', async () => {
  const { result, close, rerender } = mount();
  let playback: Promise<boolean>;
  act(() => {
    playback = result.current.play(item);
  });
  await act(async () => {});
  await act(async () => {
    fixture.socketDisconnect();
    await playback;
  });
  expect(result.current.playError).toContain('disconnected');
  expect(result.current.playStatus).toBe('');
  fixture.socketReconnect();
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  act(() => {
    playback = result.current.play(item);
  });
  rerender({ id: 'media_player.gym', disabled: false });
  await act(async () => {
    ack.resolve({});
    await playback;
  });
  expect(close).not.toHaveBeenCalled();
  expect(result.current.playError).toBe('');
  expect(result.current.playStatus).toBe('');
});

it('clears Already playing feedback when identity, state, or connection changes', async () => {
  fixture.publish(source, 'playing', { media_content_id: 'jazz' });
  const { result } = mount();
  await act(async () => {
    await result.current.play(item);
  });
  act(() => fixture.publish(source, 'playing', { media_content_id: 'other' }));
  expect(result.current.playStatus).toBe('');
  act(() => fixture.publish(source, 'playing', { media_content_id: 'jazz' }));
  await act(async () => {
    await result.current.play(item);
  });
  act(() => fixture.publish(source, 'paused', { media_content_id: 'jazz' }));
  expect(result.current.playStatus).toBe('');
  act(() => fixture.publish(source, 'playing', { media_content_id: 'jazz' }));
  await act(async () => {
    await result.current.play(item);
  });
  act(() => fixture.socketDisconnect());
  expect(result.current.playStatus).toBe('');
});
it('clears unverified feedback when later playback identity changes', async () => {
  vi.useFakeTimers();
  const { result } = mount();
  let playback: Promise<boolean>;
  act(() => {
    playback = result.current.play(item);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
    await playback;
  });
  expect(result.current.playStatus).toContain('Request accepted');
  act(() => fixture.publish(source, 'playing', { media_content_id: 'unrelated' }));
  expect(result.current.playStatus).toBe('');
});

it('sends a different favourite and never treats title-only metadata as a verified no-op', async () => {
  vi.useFakeTimers();
  fixture.publish(source, 'playing', { media_title: item.title });
  const { result, close } = mount();
  let playback: Promise<boolean>;
  act(() => { playback = result.current.play(item); });
  expect(fixture.calls).toHaveLength(1);
  await act(async () => { fixture.publish(source, 'playing', { media_title: 'New jazz title' }); await vi.advanceTimersByTimeAsync(20_000); await playback; });
  act(() => { playback = result.current.play(item); });
  expect(fixture.calls).toHaveLength(2);
  await act(async () => { fixture.publish(source, 'playing', { media_content_id: 'jazz-track', media_title: 'Jazz track' }); await playback; });
  const other = { ...item, title: 'Other favourite', media_content_id: 'other' };
  act(() => { playback = result.current.play(other); });
  expect(fixture.calls).toHaveLength(3);
  expect(close).toHaveBeenCalledTimes(1);
  await act(async () => { fixture.publish(source, 'playing', { media_content_id: 'other-track' }); await playback; });
  expect(close).toHaveBeenCalledTimes(2);
});

it.each(['media_title', 'media_playlist'])('does not confirm or cache a %s-only change with an unrelated unchanged content ID', async key => {
  vi.useFakeTimers();
  const { result, close } = mount(); let playback: Promise<boolean>;
  act(() => { playback = result.current.play(item); });
  await act(async () => { fixture.publish(source, 'playing', { media_content_id: 'track-1', [key]: 'Changed metadata' }); await vi.advanceTimersByTimeAsync(20_000); await playback; });
  expect(result.current.playStatus).toContain('Request accepted');
  expect(result.current.playError).toBe(''); expect(close).not.toHaveBeenCalled();
  act(() => { playback = result.current.play(item); });
  expect(fixture.calls).toHaveLength(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); await playback; });
  expect(close).not.toHaveBeenCalled();
});
it('permanently invalidates a rejected source error across A to B to A navigation', async () => {
  fixture.respondWith(() => Promise.reject(new Error('Source A failed')));
  const { result, rerender } = mount();
  await act(async () => { await result.current.play(item); });
  expect(result.current.commandError).toContain('Source A failed');
  rerender({ id: 'media_player.gym', disabled: false });
  expect(result.current.commandError).toBeNull();
  rerender({ id: source, disabled: false });
  expect(result.current.commandError).toBeNull(); expect(result.current.playError).toBe('');
});

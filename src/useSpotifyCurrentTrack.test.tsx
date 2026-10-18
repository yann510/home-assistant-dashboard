// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';
import { useSpotifyCurrentTrack } from './useSpotifyCurrentTrack';
const A = 'spotify:track:0000000000000000000001';
const send = vi.fn();
const track = { state: 'paused', attributes: { source: 'Spotify', media_title: 'Song A', media_content_id: A } };
beforeEach(() => {
  send.mockReset();
  useStore.setState({ connectionStatus: 'connected', connection: { connected: true, sendMessagePromise: send } as unknown as Connection });
});
afterEach(cleanup);
it('accepts paused exact Spotify metadata and rejects retained TV, ambiguous or non-track metadata', () => {
  const { result, rerender } = renderHook(({ player }) => useSpotifyCurrentTrack('media_player.gym', player, true), {
    initialProps: { player: track },
  });
  expect(result.current).toBe(A);
  expect(send).not.toHaveBeenCalled();
  rerender({ player: { ...track, attributes: { ...track.attributes, source: 'TV' } } });
  expect(result.current).toBeUndefined();
  rerender({ player: { ...track, attributes: { ...track.attributes, source: '' } } });
  expect(result.current).toBeUndefined();
  rerender({ player: { ...track, attributes: { ...track.attributes, media_content_id: 'spotify:episode:0000000000000000000001' } } });
  expect(result.current).toBeUndefined();
});
it('resolves exact paused native Connect sessions server-side and invalidates delayed identities on track/source changes', async () => {
  let old!: (value: unknown) => void;
  send
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          old = resolve;
        })
    )
    .mockResolvedValue({ source_entity: 'media_player.gym', track_uri: A });
  const wrapper = { ...track, attributes: { ...track.attributes, media_content_id: 'x-sonos-vli:RINCON_123:2,spotify:session' } };
  const { result, rerender } = renderHook(({ player }) => useSpotifyCurrentTrack('media_player.gym', player, true), {
    initialProps: { player: wrapper },
  });
  expect(result.current).toBeUndefined();
  expect(send).toHaveBeenCalledWith({ type: 'dashboard_music/current_track', source_entity: 'media_player.gym' });
  rerender({ player: { ...wrapper, attributes: { ...wrapper.attributes, media_title: 'Song B' } } });
  await waitFor(() => expect(result.current).toBe(A));
  rerender({ player: { ...wrapper, attributes: { ...wrapper.attributes, source: 'TV' } } });
  expect(result.current).toBeUndefined();
  await act(async () => old({ source_entity: 'media_player.gym', track_uri: A }));
  expect(result.current).toBeUndefined();
});
it('never borrows an unrelated cloud target and fails closed on lookup errors', async () => {
  send.mockResolvedValue({ source_entity: 'media_player.bedroom', track_uri: A });
  const wrapper = { ...track, attributes: { ...track.attributes, media_content_id: 'x-sonos-vli:RINCON_123:2,spotify:session' } };
  const { result } = renderHook(() => useSpotifyCurrentTrack('media_player.gym', wrapper, true));
  await act(async () => {});
  expect(result.current).toBeUndefined();
});
it('does not resurrect a pre-disconnect Connect identity while reconnect lookup is pending', async () => {
  send.mockResolvedValueOnce({ source_entity: 'media_player.gym', track_uri: A });
  const wrapper = { ...track, attributes: { ...track.attributes, media_content_id: 'x-sonos-vli:RINCON_123:2,spotify:session' } };
  const { result } = renderHook(() => useSpotifyCurrentTrack('media_player.gym', wrapper, true));
  await waitFor(() => expect(result.current).toBe(A));
  act(() => useStore.setState({ connectionStatus: 'disconnected' }));
  expect(result.current).toBeUndefined();
  send.mockReturnValueOnce(new Promise(() => {}));
  act(() => useStore.setState({ connectionStatus: 'connected' }));
  expect(result.current).toBeUndefined();
});

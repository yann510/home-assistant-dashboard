// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';
import { useSpotifyBrowser } from './useSpotifyBrowser';
const send = vi.fn();
const node = (id: string, title = id) => ({ title, media_content_id: id, media_content_type: 'spotify://library', can_expand: true });
beforeEach(() => {
  useStore.setState({ connection: { connected: true, sendMessagePromise: send, addEventListener() {}, removeEventListener() {} } as unknown as Connection, connectionStatus: 'connected' });
  send.mockReset();
  send.mockImplementation(async (m: Record<string, string>) => {
    if (m.type === 'dashboard_spotify/search') return { items: [{ ...node(m.query), can_play: true }], total: 2, next_offset: m.offset ? null : 10 };
    if (!m.media_content_id) return { children: [node('spotify://account/library', 'Spotify')] };
    if (m.media_content_id.endsWith('/library')) return { children: [node('spotify://account/current_user_top_tracks', 'Top Tracks'), node('spotify://account/current_user_recently_played', 'Recently played'), node('spotify://account/current_user_playlists', 'Playlists')] };
    return { children: [{ ...node(m.media_content_id + '/track', 'Personal track'), can_play: true }] };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('discovers account categories from Sonos and loads real home sections', async () => {
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'home', ''));
  await waitFor(() => expect(result.current.sections.length).toBe(3));
  expect(result.current.sections[0].items[0].title).toBe('Personal track');
  expect(result.current.categories.map(x => x.title)).toContain('Playlists');
});
it('debounces search, clears stale results immediately, and pages without duplicating entries', async () => {
  const { result, rerender } = renderHook(({ query }) => useSpotifyBrowser('media_player.room', true, 'search', query), { initialProps: { query: 'jazz' } });
  expect(send).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.items[0]?.title).toBe('jazz'));
  act(() => result.current.more());
  await waitFor(() => expect(result.current.nextOffset).toBeNull());
  expect(result.current.items).toHaveLength(1);
  rerender({ query: 'house' });
  expect(result.current.items).toHaveLength(0);
  await waitFor(() => expect(result.current.items[0]?.title).toBe('house'));
});
it('suppresses a response after navigation away from search', async () => {
  let resolve!: (x: unknown) => void;
  send.mockImplementation(() => new Promise(r => { resolve = r; }));
  const { result, rerender } = renderHook(({ view }) => useSpotifyBrowser('media_player.room', true, view, 'jazz'), { initialProps: { view: 'search' as 'search' | 'library' } });
  await waitFor(() => expect(send).toHaveBeenCalled());
  const oldResolve = resolve;
  rerender({ view: 'library' });
  await act(async () => oldResolve({ items: [node('old')], next_offset: null }));
  expect(result.current.items).toHaveLength(0);
});
it('does no background work while closed', async () => {
  renderHook(() => useSpotifyBrowser('media_player.room', false, 'home', ''));
  expect(send).not.toHaveBeenCalled();
});
it('exposes retry after a rejected library request', async () => {
  send.mockRejectedValueOnce(new Error('no'));
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'library', ''));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.categories.length).toBe(3));
});
it('clears results on disconnect and ignores a late response', async () => {
  let resolve!: (x: unknown) => void;
  send.mockImplementation(() => new Promise(r => { resolve = r; }));
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'search', 'jazz'));
  await waitFor(() => expect(send).toHaveBeenCalled());
  act(() => useStore.setState({ connectionStatus: 'disconnected' }));
  await act(async () => resolve({ items: [node('late')], next_offset: null }));
  expect(result.current.items).toHaveLength(0);
  expect(result.current.loading).toBe(false);
});
it('bounds a stalled search and retries it', async () => {
  vi.useFakeTimers();
  send.mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'search', 'jazz'));
  await act(async () => vi.advanceTimersByTimeAsync(15400));
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toContain('retry');
  send.mockResolvedValue({ items: [node('retried')], total: 1, next_offset: null });
  act(() => result.current.retry());
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(result.current.items[0].title).toBe('retried');
});
it.each([
  ['spotify_not_configured', 'Connect Spotify in Home Assistant'],
  ['spotify_auth_required', 'Reconnect Spotify in Home Assistant'],
  ['unauthorized', 'permission'],
  ['unknown_command', 'Set up Spotify search'],
  ['rate_limited', 'Wait before retrying'],
])('explains the safe recovery for %s without exposing raw errors', async (code, expected) => {
  send.mockRejectedValue({ code, message: 'secret-token-do-not-display' });
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'search', 'jazz'));
  await waitFor(() => expect(result.current.error).toContain(expected));
  expect(result.current.error).not.toContain('secret-token');
});
it('starts a returning query at page one after another query', async () => {
  send.mockImplementation(async (m: { query: string; offset: number }) => ({ items: [node(`${m.query} page ${m.offset}`)], total: 20, next_offset: m.offset ? null : 10 }));
  const { result, rerender } = renderHook(({ query }) => useSpotifyBrowser('media_player.room', true, 'search', query), { initialProps: { query: 'jazz' } });
  await waitFor(() => expect(result.current.items[0]?.title).toBe('jazz page 0'));
  act(() => result.current.more());
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  rerender({ query: 'house' });
  await waitFor(() => expect(result.current.items[0]?.title).toBe('house page 0'));
  rerender({ query: 'jazz' });
  await waitFor(() => expect(result.current.items[0]?.title).toBe('jazz page 0'));
  expect(result.current.items).toHaveLength(1);
});
it('starts at page one after reconnecting a paginated search', async () => {
  send.mockImplementation(async (m: { offset: number }) => ({ items: [node(`page ${m.offset}`)], total: 20, next_offset: m.offset ? null : 10 }));
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'search', 'jazz'));
  await waitFor(() => expect(result.current.items[0]?.title).toBe('page 0'));
  act(() => result.current.more());
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  act(() => useStore.setState({ connectionStatus: 'disconnected' }));
  expect(result.current.items).toHaveLength(0);
  act(() => useStore.setState({ connectionStatus: 'connected' }));
  await waitFor(() => expect(result.current.items[0]?.title).toBe('page 0'));
  expect(result.current.items).toHaveLength(1);
});
it('retries a failed later page without dropping the earlier page', async () => {
  let rejectPage = true;
  send.mockImplementation(async (m: { offset: number }) => {
    if (m.offset && rejectPage) { rejectPage = false; throw new Error('transient'); }
    return { items: [node(`page ${m.offset}`)], total: 20, next_offset: m.offset ? null : 10 };
  });
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'search', 'jazz'));
  await waitFor(() => expect(result.current.items[0]?.title).toBe('page 0'));
  act(() => result.current.more());
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.items[0].title).toBe('page 0');
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items.map(x => x.title)).toEqual(['page 0', 'page 10']));
});
it('puts real playlists first and derives bounded collection covers from actual children', async () => {
  send.mockImplementation(async (m: Record<string, string>) => {
    if (!m.media_content_id) return { children: [node('spotify://account/library')] };
    if (m.media_content_id.endsWith('/library')) return { children: ['current_user_recently_played', 'current_user_saved_tracks', 'current_user_top_tracks', 'current_user_playlists', ...Array.from({ length: 8 }, (_, i) => `collection${i}`)].map(id => node(`spotify://account/${id}`, id)) };
    return { children: Array.from({ length: 20 }, (_, i) => ({ ...node(`${m.media_content_id}/track${i}`), thumbnail: `/actual${i}.jpg`, can_play: true })) };
  });
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'home', ''));
  await waitFor(() => expect(result.current.sections.length).toBe(3));
  expect(result.current.sections.map(x => x.title)).toEqual(['current_user_playlists', 'current_user_top_tracks', 'current_user_recently_played']);
  expect(result.current.sections[0].items).toHaveLength(8);
  expect(result.current.categories.find(x => x.title === 'current_user_saved_tracks')?.previewArtwork).toEqual(['/actual0.jpg', '/actual1.jpg', '/actual2.jpg', '/actual3.jpg']);
  expect(send).toHaveBeenCalledTimes(9); // root+library+3 primary folders+4 collection previews, never recursive.
});
it('requests typed grouped search and keeps independent category totals', async () => {
  send.mockImplementation(async (message: { kind: string }) => ({ kind: message.kind, groups: Object.fromEntries(['track', 'playlist', 'album', 'artist'].map((kind, index) => [kind, { kind, items: [node(kind)], total: index + 12, next_offset: 10 }])) }));
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'search', 'jazz', undefined, 'all'));
  await waitFor(() => expect(result.current.groups.artist?.total).toBe(15));
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'all', offset: 0 }));
  expect(result.current.groups.playlist?.items[0].title).toBe('playlist');
  expect(result.current.items).toHaveLength(0);
});
it('restores a selected category loaded range and cancels stale category responses', async () => {
  send.mockImplementation(async (m: { kind: string; offset: number }) => ({ kind: m.kind, items: [node(`${m.kind}${m.offset}`)], total: 30, next_offset: m.offset >= 20 ? null : m.offset + 10 }));
  const { result, rerender } = renderHook(({ kind, offset }) => useSpotifyBrowser('media_player.room', true, 'search', 'jazz', undefined, kind, offset), { initialProps: { kind: 'album' as 'album' | 'artist', offset: 20 } });
  await waitFor(() => expect(result.current.items.map(x => x.title)).toEqual(['album0', 'album10', 'album20']));
  rerender({ kind: 'artist', offset: 0 });
  expect(result.current.items).toHaveLength(0);
  await waitFor(() => expect(result.current.items[0]?.title).toBe('artist0'));
  expect(result.current.items).toHaveLength(1);
});
it('restarts after an event-only ready on the same socket and discards its cancelled response', async () => {
 const handlers = new Map<string, Set<() => void>>();
 const connection = { connected: true, sendMessagePromise: send, addEventListener: (event: string, handler: () => void) => { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(handler); }, removeEventListener: (event: string, handler: () => void) => handlers.get(event)?.delete(handler) };
 useStore.setState({ connection: connection as unknown as Connection, connectionStatus: 'connected' });
 let resolve!: (value: unknown) => void;
 send.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
 const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'search', 'jazz'));
 await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
 act(() => handlers.get('disconnected')?.forEach(handler => handler()));
 send.mockResolvedValue({ items: [node('fresh')], total: 1, next_offset: null });
 act(() => handlers.get('ready')?.forEach(handler => handler()));
 await waitFor(() => expect(result.current.items[0]?.title).toBe('fresh'));
 await act(async () => resolve({ items: [node('stale')], total: 1, next_offset: null }));
 expect(result.current.items[0]?.title).toBe('fresh');
});
it('loads complete collection pages beyond 48 and preserves repeated songs by position', async () => {
  const folder = node('spotify://account/spotify:playlist:ABCDEFGHIJKLMNOPQRSTUV');
  send.mockImplementation(async (m: { offset: number }) => ({ items: Array.from({ length: m.offset ? 5 : 50 }, (_, index) => ({ ...node('spotify:track:duplicate'), position: m.offset + index, duration_ms: 123000 })), total: 55, next_offset: m.offset ? null : 50, next_cursor: null, collection: { ...folder, title: 'Real playlist', description: '<b>plain text</b>' } }));
  const { result, rerender } = renderHook(({ offset }) => useSpotifyBrowser('media_player.room', true, 'home', '', folder, 'all', offset), { initialProps: { offset: 0 } });
  await waitFor(() => expect(result.current.items).toHaveLength(50));
  rerender({ offset: 50 });
  await waitFor(() => expect(result.current.items).toHaveLength(55));
  expect(new Set(result.current.items.map(x => x.rowKey)).size).toBe(55);
  expect(result.current.total).toBe(55);
  expect(result.current.collection?.description).toBe('<b>plain text</b>');
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'dashboard_spotify/collection', offset: 50, limit: 50 }));
});
it('restores cursor collection ranges and preserves recent repeat plays across pages', async () => {
  const recent = node('spotify://account/current_user_recently_played');
  send.mockImplementation(async (m: { cursor?: string }) => ({ items: [{ ...node('same'), position: 0, played_at: m.cursor ? 'earlier' : 'later' }], total: null, next_offset: null, next_cursor: m.cursor ? null : '12345' }));
  const { result, rerender } = renderHook(({ folder, offset }) => useSpotifyBrowser('media_player.room', true, 'home', '', folder, 'all', offset), { initialProps: { folder: recent, offset: 50 } });
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  expect(result.current.total).toBeNull();
  expect(result.current.items.map(x => x.played_at)).toEqual(['later', 'earlier']);
  expect(new Set(result.current.items.map(x => x.rowKey)).size).toBe(2);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ cursor: '12345', offset: 0 }));
  rerender({ folder: node('native:other'), offset: 0 });
  await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'media_player/browse_media', media_content_id: 'native:other' })));
  rerender({ folder: recent, offset: 50 });
  await waitFor(() => expect(result.current.items).toHaveLength(2));
});
it('keeps loaded collection rows when a later page fails and retries without duplicating', async () => {
  let fail = true;
  send.mockImplementation(async (m: { offset: number }) => {
    if (m.offset && fail) { fail = false; throw { code: 'rate_limited' }; }
    return { items: [{ ...node(`song${m.offset}`), position: m.offset }], total: 51, next_offset: m.offset ? null : 50, next_cursor: null };
  });
  const folder = node('spotify://account/current_user_saved_tracks');
  const { result, rerender } = renderHook(({ offset }) => useSpotifyBrowser('media_player.room', true, 'home', '', folder, 'all', offset), { initialProps: { offset: 0 } });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  rerender({ offset: 50 });
  await waitFor(() => expect(result.current.error).toContain('Wait'));
  expect(result.current.items).toHaveLength(1);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items).toHaveLength(2));
});
it('shows restricted collection details as unavailable and suppresses late collection reads', async () => {
  const folder = node('spotify://account/spotify:playlist:ABCDEFGHIJKLMNOPQRSTUV');
  send.mockRejectedValueOnce({ code: 'spotify_collection_restricted', message: 'private upstream secret' });
  const { result } = renderHook(() => useSpotifyBrowser('media_player.room', true, 'home', '', folder));
  await waitFor(() => expect(result.current.error).toContain('still play'));
  expect(result.current.error).not.toContain('secret');
  let resolve!: (x: unknown) => void;
  send.mockImplementation(() => new Promise(r => { resolve = r; }));
  act(() => result.current.retry());
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  act(() => useStore.setState({ connectionStatus: 'disconnected' }));
  await act(async () => resolve({ items: [node('late')], total: 1, next_offset: null, next_cursor: null }));
  expect(result.current.items).toHaveLength(0);
});

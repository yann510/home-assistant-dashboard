// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';
import { CanvasPlayer } from './CanvasPlayer';
const music = vi.hoisted(() => ({ disabled: false, session: { entityId: 'media_player.room', connected: true, coordinator: { state: 'playing' } }, favouritePlayback: { play: vi.fn(), pending: null, playError: '', commandError: '', playStatus: '' }, favourites: { items: [], loading: false }, setLibraryOpen: vi.fn() }));
vi.mock('./CanvasMusicProvider', () => ({ useCanvasMusic: () => music }));
vi.mock('./CanvasMusic', () => ({ CanvasMusic: () => <div>Persistent Sonos controls</div> }));
vi.mock('@hakit/core', async importOriginal => ({ ...await importOriginal<object>(), useHass: () => ({ joinHassUrl: (x: string) => x }) }));
afterEach(cleanup);
it('offers search navigation, real results and confirmed playback without dismissing the browser', async () => {
  const send = vi.fn(async (message: Record<string, string>) => message.type === 'dashboard_spotify/search' ? { items: [{ title: 'Real song', subtitle: 'Artist', media_content_type: 'music', media_content_id: 'spotify:track:real', can_play: true }], total: 1, next_offset: null } : { children: [] });
  useStore.setState({ connection: { connected: true, sendMessagePromise: send, addEventListener() {}, removeEventListener() {} } as unknown as Connection, connectionStatus: 'connected' });
  const close = vi.fn();
  music.favouritePlayback.play.mockResolvedValue(true);
  render(<CanvasPlayer onClose={close} />);
  expect(screen.getByRole('searchbox', { name: 'Search Spotify songs' })).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Spotify songs' }), { target: { value: 'song' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Play Real song' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Play Real song' }));
  await waitFor(() => expect(music.favouritePlayback.play).toHaveBeenCalledWith(expect.objectContaining({ media_content_id: 'spotify:track:real' })));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByText('Persistent Sonos controls')).toBeTruthy();
});

function installLibrary() {
  const node = (suffix: string, title: string) => ({ title, media_content_id: `spotify://account/${suffix}`, media_content_type: `spotify://${suffix}`, can_expand: true });
  const categories = [node('current_user_top_tracks', 'Top Tracks'), node('current_user_recently_played', 'Recently played'), node('current_user_playlists', 'Playlists'), node('current_user_saved_tracks', 'Liked songs')];
  const playlist = { ...node('spotify:playlist:actual', 'Evening playlist'), can_play: true, thumbnail: '/cover.jpg' };
  const song = { title: 'Real song', media_content_id: 'spotify:track:actual', media_content_type: 'music', can_play: true };
  const send = vi.fn(async (message: Record<string, string>) => {
    if (message.type === 'dashboard_spotify/search') return { items: [song], total: 1, next_offset: null };
    if (!message.media_content_id) return { children: [node('library', 'Spotify')] };
    if (message.media_content_id.endsWith('/library')) return { children: categories };
    if (message.media_content_id.endsWith('/current_user_playlists')) return { children: [playlist] };
    return { children: [song] };
  });
  useStore.setState({ connection: { connected: true, sendMessagePromise: send, addEventListener() {}, removeEventListener() {} } as unknown as Connection, connectionStatus: 'connected' });
  return send;
}
it('integrates playlists, favourites and personal collections in one home without navigation tabs', async () => {
  installLibrary();
  render(<CanvasPlayer onClose={() => {}} />);
  await screen.findByRole('button', { name: 'Open Evening playlist' });
  expect(screen.queryByRole('navigation', { name: 'Music navigation' })).toBeNull();
  expect(screen.getAllByRole('heading', { level: 3 }).map(x => x.textContent)).toEqual(['Playlists', 'Sonos favourites', 'Top Tracks', 'Recently played', 'Your library']);
  expect(screen.getByRole('button', { name: 'Open Liked songs' })).toBeTruthy();
});
it('clearing song search restores the playlist home and opens real playlists with breadcrumbs', async () => {
  const send = installLibrary();
  render(<CanvasPlayer onClose={() => {}} />);
  await screen.findByRole('button', { name: 'Open Evening playlist' });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'song' } });
  await screen.findByRole('button', { name: 'Play Real song' });
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  await screen.findByRole('button', { name: 'Open Evening playlist' });
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Open Evening playlist' }));
  await screen.findByRole('button', { name: 'Play Real song' });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ media_content_id: 'spotify://account/spotify:playlist:actual' }));
  expect(screen.getByRole('navigation', { name: 'Music breadcrumbs' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Music home' }));
  await screen.findByRole('button', { name: 'Open Evening playlist' });
});
it('keeps playlists and collections usable when Top Tracks fails and retries the failed section', async () => {
  const library = installLibrary();
  const respond = library.getMockImplementation()!;
  let failed = true;
  library.mockImplementation(async message => {
    if (message.media_content_id?.endsWith('/current_user_top_tracks') && failed) throw new Error('Failed track service');
    return respond(message);
  });
  render(<CanvasPlayer onClose={() => {}} />);
  await screen.findByRole('button', { name: 'Open Evening playlist' });
  expect(screen.getByRole('button', { name: 'Open Liked songs' })).toBeTruthy();
  const retry = screen.getByRole('button', { name: 'Retry Top Tracks' });
  expect(retry.closest('section')?.textContent).toContain('Could not load Top Tracks');
  expect(retry.closest('section')?.textContent).not.toContain('No music here');
  failed = false;
  fireEvent.click(retry);
  expect(screen.getByRole('button', { name: 'Open Evening playlist' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry Top Tracks' })).toBeNull());
  expect(screen.getByRole('button', { name: 'Open Liked songs' })).toBeTruthy();
});

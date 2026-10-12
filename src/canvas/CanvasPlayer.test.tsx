// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';
import { CanvasPlayer } from './CanvasPlayer';
const music = vi.hoisted(() => ({ disabled: false, session: { entityId: 'media_player.room', connected: true, coordinator: { state: 'playing' } }, favouritePlayback: { play: vi.fn(), pending: null as { title: string } | null, playError: '', commandError: '', playStatus: '' }, favourites: { items: [], loading: false }, setLibraryOpen: vi.fn() }));
vi.mock('./CanvasMusicProvider', () => ({ useCanvasMusic: () => music }));
vi.mock('./CanvasMusic', () => ({ CanvasMusic: () => <div>Persistent Sonos controls</div> }));
vi.mock('@hakit/core', async importOriginal => ({ ...await importOriginal<object>(), useHass: () => ({ joinHassUrl: (x: string) => x }) }));
beforeEach(() => {
  music.disabled = false;
  music.favouritePlayback.pending = null;
  music.favouritePlayback.play.mockReset().mockResolvedValue(true);
});
afterEach(cleanup);
it('offers search navigation, real results and confirmed playback without dismissing the browser', async () => {
  const send = vi.fn(async (message: Record<string, string>) => message.type === 'dashboard_spotify/search' ? { items: [{ title: 'Real song', subtitle: 'Artist', media_content_type: 'music', media_content_id: 'spotify:track:real', can_play: true }], total: 1, next_offset: null } : { children: [] });
  useStore.setState({ connection: { connected: true, sendMessagePromise: send, addEventListener() {}, removeEventListener() {} } as unknown as Connection, connectionStatus: 'connected' });
  const close = vi.fn();
  music.favouritePlayback.play.mockResolvedValue(true);
  render(<CanvasPlayer onClose={close} />);
  expect(screen.getByRole('searchbox', { name: 'Search Spotify' })).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Spotify' }), { target: { value: 'song' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Play Real song' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Play Real song' }));
  await waitFor(() => expect(music.favouritePlayback.play).toHaveBeenCalledWith(expect.objectContaining({ media_content_id: 'spotify:track:real' })));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByText('Persistent Sonos controls')).toBeTruthy();
});

function installLibrary() {
  const node = (suffix: string, title: string) => ({ title, media_content_id: `spotify://account/${suffix}`, media_content_type: `spotify://${suffix}`, can_expand: true });
  const categories = [node('current_user_top_tracks', 'Top Tracks'), node('current_user_recently_played', 'Recently played'), node('current_user_playlists', 'Playlists'), { ...node('current_user_saved_tracks', 'Liked songs'), thumbnail: '/liked.jpg' }, node('current_user_saved_albums', 'Albums')];
  const playlist = { ...node('spotify:playlist:ABCDEFGHIJKLMNOPQRSTUV', 'Evening playlist'), can_play: true, thumbnail: '/cover.jpg' };
  const song = { title: 'Real song', media_content_id: 'spotify:track:actual', media_content_type: 'music', can_play: true };
  const send = vi.fn(async (message: Record<string, string>) => {
    if (message.type === 'dashboard_spotify/search') return { items: [song], total: 1, next_offset: null as number | null };
    if (message.type === 'dashboard_spotify/collection') return { items: message.media_content_id.endsWith('/current_user_playlists') ? [playlist] : [song], total: 1, next_offset: null, next_cursor: null };
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
  await screen.findByRole('button', { name: 'Play Evening playlist' });
  expect(screen.getByRole('navigation', { name: 'Music navigation' })).toBeTruthy();
  expect(screen.getAllByRole('heading', { level: 3 }).map(x => x.textContent)).toEqual(['Playlists', 'Sonos favourites', 'Top Tracks', 'Recently played', 'Your library']);
  expect(screen.getByRole('button', { name: 'Open Liked songs' })).toBeTruthy();
});
it('clearing song search restores playlist home and See all browses the real category', async () => {
  const send = installLibrary();
  render(<CanvasPlayer onClose={() => {}} />);
  await screen.findByRole('button', { name: 'Play Evening playlist' });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'song' } });
  await screen.findByRole('button', { name: 'Play Real song' });
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  await screen.findByRole('button', { name: 'Play Evening playlist' });
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'See all Playlists' }));
  await screen.findByRole('heading', { name: 'Playlists' });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ media_content_id: 'spotify://account/current_user_playlists' }));
  expect(screen.queryByRole('navigation', { name: 'Music breadcrumbs' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Music home' }));
  await screen.findByRole('button', { name: 'Play Evening playlist' });
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
  await screen.findByRole('button', { name: 'Play Evening playlist' });
  expect(screen.getByRole('button', { name: 'Open Liked songs' })).toBeTruthy();
  const retry = screen.getByRole('button', { name: 'Retry Top Tracks' });
  expect(retry.closest('section')?.textContent).toContain('Could not load Top Tracks');
  expect(retry.closest('section')?.textContent).not.toContain('No music here');
  failed = false;
  fireEvent.click(retry);
  expect(screen.getByRole('button', { name: 'Play Evening playlist' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry Top Tracks' })).toBeNull());
  expect(screen.getByRole('button', { name: 'Open Liked songs' })).toBeTruthy();
});

it('plays a playable and expandable playlist from its artwork or title without browsing it', async () => {
  const send = installLibrary();
  const close = vi.fn();
  render(<CanvasPlayer onClose={close} />);
  const title = await screen.findByText('Evening playlist');
  send.mockClear();
  fireEvent.click(title);
  expect(music.favouritePlayback.play).toHaveBeenCalledTimes(1);
  fireEvent.click(title.closest('button')!.querySelector('img')!);
  expect(music.favouritePlayback.play).toHaveBeenCalledTimes(2);
  expect(music.favouritePlayback.play).toHaveBeenCalledWith(expect.objectContaining({ media_content_id: 'spotify://account/spotify:playlist:ABCDEFGHIJKLMNOPQRSTUV', can_play: true, can_expand: true }));
  expect(send).not.toHaveBeenCalled();
  expect(screen.queryByRole('navigation', { name: 'Music breadcrumbs' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Play Evening playlist' })).toHaveLength(1);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByText('Persistent Sonos controls')).toBeTruthy();
});
it.each(['disabled', 'pending'] as const)('prevents playlist playback when %s while keeping real collections browsable', async state => {
  installLibrary();
  const { rerender } = render(<CanvasPlayer onClose={() => {}} />);
  await screen.findByRole('button', { name: 'Play Evening playlist' });
  if (state === 'disabled') music.disabled = true;
  else music.favouritePlayback.pending = { title: 'Other music' };
  rerender(<CanvasPlayer onClose={() => {}} />);
  const card = screen.getByRole('button', { name: 'Play Evening playlist' }) as HTMLButtonElement;
  expect(card.disabled).toBe(true);
  fireEvent.click(card);
  expect(music.favouritePlayback.play).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'Open Liked songs' }) as HTMLButtonElement).disabled).toBe(false);
});
it('places one Liked songs shortcut above playlist cards and browses the actual saved tracks category', async () => {
  const send = installLibrary();
  render(<CanvasPlayer onClose={() => {}} />);
  const shortcut = await screen.findByRole('button', { name: 'Open Liked songs' });
  expect(screen.getAllByRole('button', { name: 'Open Liked songs' })).toHaveLength(1);
  const playlists = screen.getByRole('region', { name: 'Playlists' });
  const favourites = screen.getByRole('region', { name: 'Sonos favourites' });
  expect(playlists.contains(shortcut)).toBe(true);
  const playlistCard = screen.getByRole('button', { name: 'Play Evening playlist' });
  expect(shortcut.compareDocumentPosition(playlistCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(shortcut.compareDocumentPosition(favourites) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(shortcut.querySelector('img')?.getAttribute('src')).toBe('/liked.jpg');
  expect(screen.getByRole('region', { name: 'Your library' }).contains(shortcut)).toBe(false);
  send.mockClear();
  fireEvent.click(shortcut);
  await screen.findByRole('heading', { name: 'Liked songs', level: 2 });
  await screen.findByRole('button', { name: 'Play Real song' });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'dashboard_spotify/collection', media_content_id: 'spotify://account/current_user_saved_tracks' }));
  expect(music.favouritePlayback.play).not.toHaveBeenCalled();
  expect(screen.queryByRole('navigation', { name: 'Music breadcrumbs' })).toBeNull();
});

it('browses playlist tracks separately, with real artwork and collection play guarded while pending', async () => {
  installLibrary();
  const { rerender } = render(<CanvasPlayer onClose={() => {}} />);
  const details = await screen.findByRole('button', { name: 'View tracks Evening playlist' });
  expect(details.parentElement?.closest('button')).toBeNull();
  fireEvent.click(details);
  await screen.findByRole('heading', { name: 'Evening playlist' });
  expect(music.favouritePlayback.play).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: 'Evening playlist collection' }).querySelector('img')?.getAttribute('src')).toBe('/cover.jpg');
  expect(await screen.findByText('1 of 1 songs loaded')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Play collection Evening playlist' }));
  expect(music.favouritePlayback.play).toHaveBeenCalledWith(expect.objectContaining({ media_content_id: 'spotify://account/spotify:playlist:ABCDEFGHIJKLMNOPQRSTUV' }));
  music.favouritePlayback.pending = { title: 'Starting music' };
  rerender(<CanvasPlayer onClose={() => {}} />);
  expect((screen.getByRole('button', { name: 'Play collection Evening playlist' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Play Real song' }) as HTMLButtonElement).disabled).toBe(true);
});
it('restores collection and search history without adding an entry per search character, and truncates forward history', async () => {
  installLibrary();
  render(<CanvasPlayer onClose={() => {}} />);
  await screen.findByRole('button', { name: 'Open Liked songs' });
  expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Forward' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Open Liked songs' }));
  await screen.findByRole('heading', { name: 'Liked songs' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Spotify' }), { target: { value: 's' } });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Spotify' }), { target: { value: 'song' } });
  await screen.findByRole('heading', { name: 'Search results' });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByRole('heading', { name: 'Liked songs' });
  expect((screen.getByRole('searchbox', { name: 'Search Spotify' }) as HTMLInputElement).value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
  expect((screen.getByRole('searchbox', { name: 'Search Spotify' }) as HTMLInputElement).value).toBe('song');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  fireEvent.click(screen.getByRole('button', { name: 'Music home' }));
  await screen.findByRole('button', { name: 'Play Evening playlist' });
  expect((screen.getByRole('button', { name: 'Forward' }) as HTMLButtonElement).disabled).toBe(true);
});
it('uses compact song rows and filters only the loaded collection, without creating category playback', async () => {
  const send = installLibrary();
  render(<CanvasPlayer onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open Liked songs' }));
  const play = await screen.findByRole('button', { name: 'Play Real song' });
  expect(play.closest('.canvas-player__song')).toBeTruthy();
  fireEvent.click(screen.getByText('Real song'));
  expect(music.favouritePlayback.play).toHaveBeenCalledWith(expect.objectContaining({ media_content_id: 'spotify:track:actual' }));
  expect(screen.queryByRole('button', { name: 'Play collection Liked songs' })).toBeNull();
  send.mockClear();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find in loaded songs' }), { target: { value: 'missing' } });
  expect(screen.getByText('No loaded songs match your filter.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Play Real song' })).toBeNull();
  expect(send).not.toHaveBeenCalled();
});

it('keeps playlist detail browsing enabled while playback is pending and navigates nested breadcrumbs', async () => {
  installLibrary();
  render(<CanvasPlayer onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'See all Playlists' }));
  await screen.findByRole('heading', { name: 'Playlists' });
  music.favouritePlayback.pending = { title: 'Other track' };
  fireEvent.click(await screen.findByRole('button', { name: 'View tracks Evening playlist' }));
  await screen.findByRole('heading', { name: 'Evening playlist' });
  expect(music.favouritePlayback.play).not.toHaveBeenCalled();
  expect(screen.getByRole('navigation', { name: 'Music breadcrumbs' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
  await screen.findByRole('heading', { name: 'Playlists' });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByRole('heading', { name: 'Evening playlist' });
});
it('returns to the prior collection when a search is emptied', async () => {
  installLibrary();
  render(<CanvasPlayer onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open Liked songs' }));
  await screen.findByRole('heading', { name: 'Liked songs' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Spotify' }), { target: { value: 'song' } });
  await screen.findByRole('heading', { name: 'Search results' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Spotify' }), { target: { value: '' } });
  await screen.findByRole('heading', { name: 'Liked songs' });
});
it('keeps the current scroll position when loading another search page', async () => {
  const send = installLibrary();
  const respond = send.getMockImplementation()!;
  send.mockImplementation(async message => message.type === 'dashboard_spotify/search' ? {
    items: [{ title: message.offset ? 'Second song' : 'First song', media_content_id: message.offset ? 'spotify:track:second' : 'spotify:track:first', media_content_type: 'music', can_play: true }], total: 2, next_offset: message.offset ? null : 10,
  } : respond(message));
  const { container } = render(<CanvasPlayer onClose={() => {}} />);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Spotify' }), { target: { value: 'song' } });
  await screen.findByRole('button', { name: 'Play First song' });
  fireEvent.click(screen.getByRole('button', { name: 'Songs' }));
  await screen.findByRole('button', { name: 'Play First song' });
  const content = container.querySelector('.canvas-player__content')!;
  content.scrollTop = 250;
  fireEvent.click(screen.getByRole('button', { name: 'Load more songs' }));
  await screen.findByRole('button', { name: 'Play Second song' });
  expect(content.scrollTop).toBe(250);
});
it('groups catalog kinds, displays actual metadata and preserves separate collection actions', async () => {
 const send = installLibrary();
 const track = { title: 'Catalog song', subtitle: 'Real artist', duration_ms: 185000, media_content_id: 'spotify:track:catalog', media_content_type: 'music', can_play: true };
 const playlist = { title: 'Catalog playlist', media_content_id: 'spotify://account/spotify:playlist:catalog', media_content_type: 'playlist', can_play: true, can_expand: true };
 const artist = { title: 'Catalog artist', media_content_id: 'spotify://account/spotify:artist:catalog', media_content_type: 'artist', can_play: false, can_expand: true };
 send.mockImplementation(async message => {
   if (message.type !== 'dashboard_spotify/search') return { children: [] } as never;
   const groups = { track: { kind: 'track', items: [track], total: 1, next_offset: null }, playlist: { kind: 'playlist', items: [playlist], total: 12, next_offset: 10 }, album: { kind: 'album', items: [], total: 0, next_offset: null }, artist: { kind: 'artist', items: [artist], total: 1, next_offset: null } };
   return (message.kind === 'all' ? { kind: 'all', groups } : groups[message.kind as keyof typeof groups]) as never;
 });
 render(<CanvasPlayer onClose={() => {}} />);
 fireEvent.change(screen.getByRole('searchbox', { name: 'Search Spotify' }), { target: { value: 'catalog' } });
 await screen.findByRole('button', { name: 'Play Catalog song' });
 expect(screen.getByText('3:05')).toBeTruthy();
 expect(screen.getByText('Real artist')).toBeTruthy();
 expect(screen.getByRole('button', { name: 'View tracks Catalog playlist' })).toBeTruthy();
 expect(screen.getByRole('button', { name: 'Open Catalog artist' })).toBeTruthy();
 expect(screen.queryByRole('button', { name: 'Play Catalog artist' })).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: 'See all Playlists' }));
 await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'playlist' })));
 expect(screen.getByRole('button', { name: 'Playlists' }).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button', { name: 'Back' }));
 await screen.findByRole('button', { name: 'Play Catalog song' });
 expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
});
it('erasing or clearing search after category changes returns to the originating collection', async () => {
 installLibrary();
 render(<CanvasPlayer onClose={() => {}} />);
 fireEvent.click(await screen.findByRole('button', { name: 'Open Liked songs' }));
 await screen.findByRole('heading', { name: 'Liked songs' });
 const input = screen.getByRole('searchbox', { name: 'Search Spotify' }) as HTMLInputElement;
 fireEvent.change(input, { target: { value: 'jazz' } });
 fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
 fireEvent.click(screen.getByRole('button', { name: 'Albums' }));
 fireEvent.change(input, { target: { value: '' } });
 await screen.findByRole('heading', { name: 'Liked songs' });
 expect(input.value).toBe('');
 fireEvent.change(input, { target: { value: 'jazz' } });
 fireEvent.click(screen.getByRole('button', { name: 'Artists' }));
 fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
 await screen.findByRole('heading', { name: 'Liked songs' });
 expect(input.value).toBe('');
});
it('renders real metadata safely, preserves the native cover, and retains Play when details are restricted', async () => {
  const send = installLibrary();
  const respond = send.getMockImplementation()!;
  let restricted = false;
  send.mockImplementation(async message => {
    if (message.type === 'dashboard_spotify/collection' && message.media_content_id.includes('spotify:playlist:')) {
      if (restricted) throw { code: 'spotify_collection_restricted' };
      return { items: [], total: 0, next_offset: null, next_cursor: null, collection: { title: 'Actual title', subtitle: 'Actual owner', description: 'Drum &amp; bass by <a href="https://example.com">Spotify</a><br>&lt;img src=x onerror=alert(1)&gt;<img src="https://example.com/pixel">', thumbnail: null, media_content_id: message.media_content_id, media_content_type: 'playlist', can_play: true, can_expand: true } };
    }
    return respond(message);
  });
  render(<CanvasPlayer onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'View tracks Evening playlist' }));
  await screen.findByRole('heading', { name: 'Actual title' });
  expect(screen.getByText('Drum & bass by Spotify <img src=x onerror=alert(1)>').querySelector('img')).toBeNull();
  expect(document.querySelector('.canvas-player__collection img')?.getAttribute('src')).toBe('/cover.jpg');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByRole('button', { name: 'View tracks Evening playlist' });
  restricted = true;
  fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
  await screen.findByText(/playlist details are unavailable/);
  expect(screen.queryByText('No music found.')).toBeNull();
  expect((screen.getByRole('button', { name: 'Play collection Evening playlist' }) as HTMLButtonElement).disabled).toBe(false);
});

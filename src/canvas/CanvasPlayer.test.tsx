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

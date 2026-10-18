import type { SpotifyPlaylist, SpotifyPlaylistPage, SpotifyPlayResult, SpotifySavedTrack } from '../../src/spotifyMusicTypes';
import { previewFavourites } from './favourites';

type PreviewResult = Partial<SpotifyPlaylistPage> & Partial<Omit<SpotifySavedTrack, 'track_uri'>> & { response?: SpotifyPlayResult; source_entity?: string; track_uri?: string | null };
const previewTrackUri = 'spotify:track:2qRWNDee5Hfi6DFjfiu58c';
/** Authenticated HA wire shapes, entirely local; this handler never opens a socket. */
export function createSpotifyPreview(params: URLSearchParams) {
  const mode = params.get('playlists');
  const song = params.get('song');
  const saved = new Map<string, boolean>();
  const paged = mode === 'paged' || mode === 'rate-limited' || mode === 'more-error';
  const items: SpotifyPlaylist[] = Array.from({ length: mode === 'empty' ? 0 : paged ? 56 : 9 }, (_, index) => ({
    uri: `spotify:playlist:${String(index + 1).padStart(22, '0')}`,
    title:
      index === 7
        ? 'Private collection'
        : index === 8
          ? 'Chill House Mix'
          : params.has('long') && index === 1
            ? 'Dinner at home with friends and a very long playlist title to read'
            : (previewFavourites[index]?.title ?? `Saved Spotify playlist ${index + 1}`),
    owner: index === 8 ? 'A friend' : 'Yann',
    thumbnail: index === 2 && params.has('brokenArt') ? '/missing-playlist-cover.jpg' : previewFavourites[index]?.thumbnail,
  }));
  return async (message: Record<string, unknown>): Promise<PreviewResult | undefined> => {
    if (message.type === 'dashboard_music/current_track') {
      const delay = Math.min(60000, Math.max(0, Number(params.get('songReadDelay')) || 0));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      return { source_entity: String(message.source_entity), track_uri: ['unknown', 'tv', 'episode', 'local'].includes(song ?? '') ? null : previewTrackUri };
    }
    if (['dashboard_music/track_saved', 'dashboard_music/set_track_saved'].includes(String(message.type))) {
      const write = message.type === 'dashboard_music/set_track_saved';
      const uri = String(message.track_uri);
      if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(uri) || (write && typeof message.saved !== 'boolean')) throw new Error('Invalid local track request');
      const delay = Math.min(60000, Math.max(0, Number(params.get(write ? 'songDelay' : 'songReadDelay')) || 0));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (song === 'auth') throw { code: 'auth_required' };
      if ((!write && song === 'read-error') || (write && (song === 'error' || (song === 'remove-error' && !message.saved)))) throw new Error('Controlled local song failure');
      if (write) saved.set(uri, message.saved as boolean);
      return { track_uri: uri, saved: saved.get(uri) ?? ['saved', 'remove-error'].includes(song ?? '') };
    }
    if (message.type === 'dashboard_music/playlists') {
      const offset = Number(message.offset ?? 0);
      const limit = Number(message.limit ?? 50);
      if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new Error('Invalid local playlist page');
      if (mode === 'unavailable') throw { code: 'unavailable', message: 'Spotify is unavailable in this preview.' };
      if (offset > 0 && mode === 'rate-limited') throw { code: 'rate_limited', retry_after: 5 };
      if (offset > 0 && mode === 'more-error') throw new Error('Could not load more Spotify playlists.');
      // Deliberate duplicate across the page boundary exercises exact URI keys.
      const page = items.slice(offset, offset + limit);
      if (offset === 50 && items[49]) page.unshift(items[49]);
      return { items: page, nextOffset: offset + limit < items.length ? offset + limit : null, total: items.length };
    }
    if (message.type !== 'call_service' || message.domain !== 'dashboard_music' || message.service !== 'play_spotify') return undefined;
    const data = message.service_data as { request_id: string; source_entity: string; playlist_uri: string };
    const requested = params.get('spotifyPlay') ?? (params.has('unconfirmed') ? 'unconfirmed' : 'confirmed');
    const status = ['confirmed', 'already_playing', 'busy', 'failed', 'unconfirmed'].includes(requested)
      ? (requested as SpotifyPlayResult['status'])
      : 'failed';
    const delay = Math.min(60000, Math.max(0, Number(params.get('spotifyDelay')) || 0));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    return {
      response: {
        ...data,
        status,
        ...(['confirmed', 'already_playing'].includes(status)
          ? {}
          : {
              message:
                status === 'unconfirmed'
                  ? 'Playback could not be confirmed. Check Spotify before trying again.'
                  : 'Spotify preview could not start this playlist.',
            }),
      },
    };
  };
}

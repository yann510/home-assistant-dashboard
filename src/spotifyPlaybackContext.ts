import type { SpotifyPlaylist } from './spotifyMusicTypes';

export const LIKED_SONGS_URI = 'spotify:collection:tracks';
export const likedSongs: SpotifyPlaylist = { uri: LIKED_SONGS_URI, title: 'Liked Songs', owner: 'Your saved songs' };
export function isSpotifyPlaybackContext(uri: string): boolean {
  return uri === LIKED_SONGS_URI || /^spotify:playlist:[A-Za-z0-9]{22}$/.test(uri);
}

export type SpotifyPlaylist = { uri: string; title: string; owner: string; thumbnail?: string };
export type SpotifyPlaylistPage = { items: SpotifyPlaylist[]; nextOffset: number | null; total: number };
export type SpotifyPlayResult = {
  request_id: string;
  status: 'confirmed' | 'already_playing' | 'busy' | 'failed' | 'unconfirmed';
  source_entity?: string;
  playlist_uri: string;
  message?: string;
};
export type SpotifySavedTrack = { track_uri: string; saved: boolean };

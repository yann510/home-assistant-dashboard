import { previewFavourites } from './favourites';
const category = (name: string, title: string) => ({ title, media_content_id: `spotify://preview/${name}`, media_content_type: `spotify://${name}`, can_expand: true, can_play: false });
const tracks = Array.from({ length: 24 }, (_, index) => ({ title: ['Midnight City', 'One More Time', 'Dreams', 'September', 'Get Lucky', 'Around the World'][index % 6], subtitle: ['M83', 'Daft Punk', 'Fleetwood Mac', 'Earth, Wind & Fire', 'Daft Punk', 'Daft Punk'][index % 6], media_content_id: `spotify:track:${String(index).padStart(22, '0')}`, media_content_type: 'music', can_play: true, can_expand: false, duration_ms: 185000 + index * 1000, thumbnail: previewFavourites[index % previewFavourites.length].thumbnail }));
/** Simulated local preview only. Production requests always use the authenticated HA socket. */
export function previewSpotify(message: Record<string, unknown>) {
  if (message.type === 'dashboard_spotify/search') {
    const offset = Number(message.offset ?? 0);
    const limit = Number(message.limit ?? 10);
    const collections = (kind: 'playlist' | 'album' | 'artist') => Array.from({ length: 16 }, (_, index) => ({ title: `${kind === 'playlist' ? 'Evening mix' : kind === 'album' ? 'Night listening' : 'Preview artist'} ${index + 1}`, subtitle: kind === 'artist' ? 'Artist' : 'Preview collection', media_content_id: `spotify://preview/spotify:${kind}:${String(index).padStart(22, '0')}`, media_content_type: `spotify://${kind}`, can_expand: true, can_play: kind !== 'artist', thumbnail: previewFavourites[index % previewFavourites.length].thumbnail }));
    const catalog = { track: tracks, playlist: collections('playlist'), album: collections('album'), artist: collections('artist') };
    const page = (kind: keyof typeof catalog) => ({ kind, items: catalog[kind].slice(offset, offset + limit), total: catalog[kind].length, next_offset: offset + limit < catalog[kind].length ? offset + limit : null });
    if (message.kind === 'all') return { kind: 'all', groups: { track: page('track'), playlist: page('playlist'), album: page('album'), artist: page('artist') } };
    return page((message.kind ?? 'track') as keyof typeof catalog);
  }
  const id = String(message.media_content_id ?? '');
  if (!id) return { children: [category('library', 'Spotify')] };
  if (id.endsWith('/library')) return { children: [category('current_user_top_tracks', 'Top Tracks'), category('current_user_recently_played', 'Recently played'), category('current_user_saved_tracks', 'Liked songs'), category('current_user_playlists', 'Playlists')] };
  if (id.endsWith('/current_user_playlists')) return { children: previewFavourites.map((item, index) => ({ ...item, media_content_id: `spotify://preview/spotify:playlist:${String(index).padStart(22, '0')}`, media_content_type: 'spotify://playlist', can_expand: true, can_play: true })) };
  return { children: tracks.map(item => ({ ...item, media_content_id: `spotify://preview/${item.media_content_id}`, media_content_type: 'spotify://track' })) };
}

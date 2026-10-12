import { previewFavourites } from './favourites';
const category = (name: string, title: string) => ({ title, media_content_id: `spotify://preview/${name}`, media_content_type: `spotify://${name}`, can_expand: true, can_play: false });
const tracks = Array.from({ length: 24 }, (_, index) => ({ title: ['Midnight City', 'One More Time', 'Dreams', 'September', 'Get Lucky', 'Around the World'][index % 6], subtitle: ['M83', 'Daft Punk', 'Fleetwood Mac', 'Earth, Wind & Fire', 'Daft Punk', 'Daft Punk'][index % 6], media_content_id: `spotify:track:${String(index).padStart(22, '0')}`, media_content_type: 'music', can_play: true, can_expand: false, duration_ms: 185000 + index * 1000, thumbnail: previewFavourites[index % previewFavourites.length].thumbnail }));
const collections = (kind: 'playlist' | 'album' | 'artist') => Array.from({ length: 16 }, (_, index) => ({ title: `${kind === 'playlist' ? 'Evening mix' : kind === 'album' ? 'Night listening' : 'Preview artist'} ${index + 1}`, subtitle: kind === 'artist' ? 'Artist' : 'Preview collection', media_content_id: `spotify://preview/spotify:${kind}:${String(index).padStart(22, '0')}`, media_content_type: `spotify://${kind}`, can_expand: true, can_play: kind !== 'artist', thumbnail: previewFavourites[index % previewFavourites.length].thumbnail }));
/** Simulated local preview only. Production requests always use the authenticated HA socket. */
export function previewSpotify(message: Record<string, unknown>) {
  if (message.type === 'dashboard_spotify/search') {
    const offset = Number(message.offset ?? 0);
    const limit = Number(message.limit ?? 10);

    const catalog = { track: tracks, playlist: collections('playlist'), album: collections('album'), artist: collections('artist') };
    const page = (kind: keyof typeof catalog) => ({ kind, items: catalog[kind].slice(offset, offset + limit), total: catalog[kind].length, next_offset: offset + limit < catalog[kind].length ? offset + limit : null });
    if (message.kind === 'all') return { kind: 'all', groups: { track: page('track'), playlist: page('playlist'), album: page('album'), artist: page('artist') } };
    return page((message.kind ?? 'track') as keyof typeof catalog);
  }
  const id = String(message.media_content_id ?? '');
  if (message.type === 'dashboard_spotify/collection') {
    const target = id.split('/').pop() ?? '';
    const detail = /^spotify:(playlist|album|artist):([A-Za-z0-9]{22})$/.exec(target);
    const kind = detail?.[1];
    const categoryTitles: Record<string, string> = { current_user_saved_tracks: 'Liked songs', current_user_playlists: 'Playlists', current_user_saved_albums: 'Albums', current_user_followed_artists: 'Artists', current_user_top_tracks: 'Top Tracks', current_user_top_artists: 'Top artists', current_user_recently_played: 'Recently played' };
    if (!detail && !(target in categoryTitles)) throw { code: 'invalid_collection' };
    const cursorCategory = target === 'current_user_recently_played' || target === 'current_user_followed_artists';
    const offset = cursorCategory ? Number(message.cursor ?? 0) : Number(message.offset ?? 0);
    const limit = Number(message.limit ?? 50);
    const collection = kind ? collections(kind as 'playlist' | 'album' | 'artist')[Number(detail![2]) % 16] : category(target, categoryTitles[target]);
    const source = kind === 'artist' || target === 'current_user_saved_albums' ? collections('album') : target === 'current_user_playlists' ? collections('playlist') : target === 'current_user_followed_artists' || target === 'current_user_top_artists' ? Array.from({ length: 65 }, (_, index) => collections('artist')[index % 16]) : Array.from({ length: target === 'current_user_recently_played' ? 75 : 125 }, (_, index) => ({ ...tracks[index % tracks.length], ...(target === 'current_user_recently_played' ? { played_at: new Date(Date.UTC(2026, 9, 12, 12, 0) - index * 60000).toISOString() } : {}) }));
    const items = source.slice(offset, offset + limit).map((item, index) => ({ ...item, position: cursorCategory ? index : offset + index }));
    const next = offset + limit < source.length ? offset + limit : null;
    return { items, total: target === 'current_user_recently_played' ? null : source.length, next_offset: cursorCategory ? null : next, next_cursor: cursorCategory && next !== null ? target === 'current_user_followed_artists' ? String(next).padStart(22, '0') : String(next) : null, collection: { ...collection, ...(kind === 'playlist' ? { description: 'A local preview playlist for checking complete collection navigation.' } : {}), ...(kind === 'album' ? { release_date: '2026-10-01' } : {}) } };
  }
  if (!id) return { children: [category('library', 'Spotify')] };
  if (id.endsWith('/library')) return { children: [category('current_user_top_tracks', 'Top Tracks'), category('current_user_recently_played', 'Recently played'), category('current_user_saved_tracks', 'Liked songs'), category('current_user_playlists', 'Playlists'), category('current_user_saved_albums', 'Albums'), category('current_user_followed_artists', 'Artists')] };
  if (id.endsWith('/current_user_playlists')) return { children: previewFavourites.map((item, index) => ({ ...item, media_content_id: `spotify://preview/spotify:playlist:${String(index).padStart(22, '0')}`, media_content_type: 'spotify://playlist', can_expand: true, can_play: true })) };
  return { children: tracks.map(item => ({ ...item, media_content_id: `spotify://preview/${item.media_content_id}`, media_content_type: 'spotify://track' })) };
}

import { expect, it } from 'vitest';
import { previewSpotify } from './spotify';
const read = (target: string, page = {}) => previewSpotify({ type: 'dashboard_spotify/collection', media_content_id: `spotify://preview/${target}`, limit: 50, ...page });
it('provides full saved songs past the native 48 with actual positions and repeated tracks', () => {
  const first = read('current_user_saved_tracks');
  const second = read('current_user_saved_tracks', { offset: 50 });
  expect(first).toMatchObject({ total: 125, next_offset: 50, next_cursor: null, collection: { title: 'Liked songs', can_play: false } });
  expect('items' in first && first.items).toHaveLength(50);
  expect('items' in second && second.items[0]).toMatchObject({ position: 50 });
  expect('items' in first && first.items[0].media_content_id).toBe('items' in first && first.items[24].media_content_id);
});
it.each(['playlist', 'album', 'artist'])('provides metadata and correct actions for preview %s details', kind => {
  const page = read(`spotify:${kind}:${'0'.repeat(22)}`);
  expect(page).toMatchObject({ collection: { can_play: kind !== 'artist', can_expand: true } });
  expect('items' in page && page.items.length).toBeGreaterThan(0);
  if (kind === 'artist') expect('items' in page && page.items[0].media_content_type).toBe('spotify://album');
});
it.each(['current_user_recently_played', 'current_user_followed_artists'])('supports server cursor pages for %s', category => {
  const first = read(category);
  expect('next_cursor' in first && first.next_cursor).toBeTruthy();
  const second = read(category, { cursor: 'next_cursor' in first ? first.next_cursor : undefined, offset: 0 });
  expect(second).toMatchObject({ next_offset: null, next_cursor: null });
  expect('items' in second && second.items.length).toBeGreaterThan(0);
  if (category === 'current_user_recently_played') expect(second).toMatchObject({ total: null, items: [expect.objectContaining({ played_at: expect.any(String) }), ...Array.from({ length: 24 }, () => expect.anything())] });
});
it('retains grouped typed search and native root discovery', () => {
  expect(previewSpotify({ type: 'dashboard_spotify/search', query: 'night', kind: 'all' })).toMatchObject({ groups: { track: { total: 24 }, artist: { total: 16 } } });
  expect(previewSpotify({ type: 'media_player/browse_media' })).toMatchObject({ children: [expect.objectContaining({ media_content_id: 'spotify://preview/library' })] });
});

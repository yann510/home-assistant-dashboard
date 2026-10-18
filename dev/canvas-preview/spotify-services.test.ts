import { expect, it } from 'vitest';
import { createSpotifyPreview } from './spotify-services';
it('serves exact playlist URIs, private owners and explicit 50-item pagination with boundary duplicate', async () => {
  const preview = createSpotifyPreview(new URLSearchParams('playlists=paged'));
  const first = await preview({ type: 'dashboard_music/playlists', offset: 0, limit: 50 });
  const second = await preview({ type: 'dashboard_music/playlists', offset: 50, limit: 50 });
  expect(first?.items).toHaveLength(50);
  expect(first?.nextOffset).toBe(50);
  expect(second?.nextOffset).toBeNull();
  expect(second?.items?.[0].uri).toBe(first?.items?.[49].uri);
  expect(first?.items?.[0]).toEqual(
    expect.objectContaining({
      uri: expect.stringMatching(/^spotify:playlist:[A-Za-z0-9]{22}$/),
      title: expect.any(String),
      owner: expect.any(String),
    })
  );
});
it.each(['confirmed', 'already_playing', 'busy', 'failed', 'unconfirmed'])(
  'returns the authenticated service response envelope for %s, without device commands',
  async status => {
    const preview = createSpotifyPreview(new URLSearchParams(`spotifyPlay=${status}`));
    expect(
      await preview({
        type: 'call_service',
        domain: 'dashboard_music',
        service: 'play_spotify',
        service_data: { request_id: 'same', source_entity: 'media_player.gym', playlist_uri: 'spotify:playlist:0000000000000000000001' },
      })
    ).toEqual({
      response: expect.objectContaining({
        request_id: 'same',
        source_entity: 'media_player.gym',
        playlist_uri: 'spotify:playlist:0000000000000000000001',
        status,
      }),
    });
    expect(await preview({ type: 'call_service', domain: 'media_player', service: 'media_pause' })).toBeUndefined();
  }
);
it('supports empty and load-more-only errors without breaking the first page', async () => {
  const empty = createSpotifyPreview(new URLSearchParams('playlists=empty'));
  expect(await empty({ type: 'dashboard_music/playlists', offset: 0, limit: 50 })).toEqual({ items: [], nextOffset: null, total: 0 });
  const limited = createSpotifyPreview(new URLSearchParams('playlists=rate-limited'));
  expect((await limited({ type: 'dashboard_music/playlists', offset: 0, limit: 50 }))?.items).toHaveLength(50);
  await expect(limited({ type: 'dashboard_music/playlists', offset: 50, limit: 50 })).rejects.toMatchObject({
    code: 'rate_limited',
    retry_after: 5,
  });
});

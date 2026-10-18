import { expect, it } from 'vitest';
import { isSpotifyPlaybackContext, LIKED_SONGS_URI } from './spotifyPlaybackContext';
it('accepts only exact liked songs or a strict playlist', () => {
  expect(isSpotifyPlaybackContext(LIKED_SONGS_URI)).toBe(true);
  expect(isSpotifyPlaybackContext(`spotify:playlist:${'a'.repeat(22)}`)).toBe(true);
  for (const uri of [
    'spotify:user:someone:collection',
    'spotify:collection',
    'spotify:collection:tracks:extra',
    'spotify:album:' + 'a'.repeat(22),
  ])
    expect(isSpotifyPlaybackContext(uri)).toBe(false);
});

import { describe, expect, it } from 'vitest';
import { spotifyTrackUri } from './spotifyTrackUri';

const id = '2qRWNDee5Hfi6DFjfiu58c';
const uri = `spotify:track:${id}`;

describe('spotifyTrackUri', () => {
  it.each([
    uri,
    `https://open.spotify.com/track/${id}`,
    `https://open.spotify.com/track/${id}?si=share#context`,
    `https://open.spotify.com/intl-fr/track/${id}?si=share`,
    `x-sonos-spotify:spotify%3atrack%3a${id}?sid=12&flags=8232&sn=12`,
    `x-sonos-spotify:${uri}?sid=12`,
  ])('extracts only a validated track from %s', value => {
    expect(spotifyTrackUri(value)).toBe(uri);
  });

  it.each([
    undefined, null, 42, {}, '', 'spotify:',
    `spotify:album:${id}`, `spotify:playlist:${id}`,
    `spotify:track:${id.slice(1)}`, `spotify:track:${id}x`,
    `spotify:track:${id.slice(1)}!`, `spotify:track:${id}\n`,
    `prefix:${uri}`, `${uri}?extra=1`,
    `http://open.spotify.com/track/${id}`,
    `https://open.spotify.com.evil.test/track/${id}`,
    `https://open.spotify.com@evil.test/track/${id}`,
    `https://evil.test/?track=https://open.spotify.com/track/${id}`,
    `https://open.spotify.com/album/${id}`,
    `https://open.spotify.com/track/${id}/extra`,
    `https://open.spotify.com/track/${id}%0A`,
    `javascript:alert('${uri}')`,
    'x-sonos-spotify:spotify%3atrack%3a%ZZ?sid=12',
    `x-sonos-spotify:spotify%253atrack%253a${id}?sid=12`,
    `x-sonos-spotify:spotify%3aplaylist%3a${id}?sid=12`,
    `x-sonos-spotify:prefix%3a${uri}?sid=12`,
    `x-sonos-spotify:javascript%3aalert(1)?track=${uri}`,
    `x-sonos-spotify:spotify%3atrack%3a${id}%3Fextra%3D1`,
  ])('rejects malformed, non-track, and untrusted metadata %j', value => {
    expect(spotifyTrackUri(value)).toBeUndefined();
  });
});

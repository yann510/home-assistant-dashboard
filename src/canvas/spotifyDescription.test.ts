import { describe, expect, it } from 'vitest';
import { spotifyDescriptionText } from './spotifyDescription';

describe('spotifyDescriptionText', () => {
  it('decodes the live playlist description', () => {
    expect(spotifyDescriptionText('21:18 of race-day drum &amp; bass: melodic lift...')).toBe('21:18 of race-day drum & bass: melodic lift...');
  });
  it('retains link labels and separates Spotify line breaks', () => {
    expect(spotifyDescriptionText('By <a href="https://example.com/?x=1&gt;2">Spotify</a><br />More<br>music')).toBe('By Spotify\nMore\nmusic');
  });
  it('decodes decimal and hexadecimal Unicode entities', () => {
    expect(spotifyDescriptionText('&#38; &#x26; &#x1F3B5; &quot;Hi&quot; &apos;yes&apos; &nbsp; &mdash;')).toBe('& & 🎵 "Hi" \'yes\'   —');
  });
  it('preserves literal comparisons and unknown entities', () => {
    expect(spotifyDescriptionText('Love <3; 2 < 4 > 1; &unknown;')).toBe('Love <3; 2 < 4 > 1; &unknown;');
  });
  it('does not parse decoded markup or double-decode entities', () => {
    expect(spotifyDescriptionText('&lt;img src=x onerror=alert(1)&gt; &amp;lt;')).toBe('<img src=x onerror=alert(1)> &lt;');
  });
  it('removes resource-bearing markup and non-description script text', () => {
    expect(spotifyDescriptionText('Music<img src="https://example.com/pixel"><script>alert(1)</script><!-- hidden --><style>p{color:red}</style>!')).toBe('Music!');
  });
  it('preserves names inherited from Object.prototype as unknown entities', () => {
    expect(spotifyDescriptionText('&constructor; &toString; &valueOf;')).toBe('&constructor; &toString; &valueOf;');
  });
  it('preserves invalid numeric entities without throwing', () => {
    expect(spotifyDescriptionText('&#x110000; &#xD800; &#0;')).toBe('&#x110000; &#xD800; &#0;');
  });
});

const trackUri = /^spotify:track:([A-Za-z0-9]{22})$(?![\s\S])/;
const trackUrl = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})(?:[?#][^\s]*)?$(?![\s\S])/;

export function spotifyTrackUri(contentId: unknown): string | undefined {
  if (typeof contentId !== 'string') return undefined;

  let value = contentId;
  if (value.startsWith('x-sonos-spotify:')) {
    // Sonos wraps the Spotify URI and appends its own service query parameters.
    // Decode once only, then validate the complete payload as a track URI.
    try {
      value = decodeURIComponent(value.slice('x-sonos-spotify:'.length).split('?')[0]);
    } catch {
      return undefined;
    }
    const match = trackUri.exec(value);
    return match ? `spotify:track:${match[1]}` : undefined;
  }

  const match = trackUri.exec(value) ?? trackUrl.exec(value);
  return match ? `spotify:track:${match[1]}` : undefined;
}

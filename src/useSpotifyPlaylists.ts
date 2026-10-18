import { isSpotifyPlaybackContext, LIKED_SONGS_URI } from './spotifyPlaybackContext';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '@hakit/core';
import { onSpeakerDisconnect, subscribeSpeakerConnectionChanged } from './speakerConnection';
import type { SpotifyPlaylist, SpotifyPlaylistPage } from './spotifyMusicTypes';

const connected = () => {
  const state = useStore.getState();
  return Boolean(state.connection?.connected && state.connectionStatus === 'connected');
};
function libraryError(error: unknown) {
  const failure = error as { code?: string; message?: string; retry_after?: number } | null;
  if (failure?.code === 'rate_limited') {
    const delay = Math.min(300, Math.max(1, Number(failure.retry_after) || 5));
    return `Spotify is busy. Try again in ${delay} seconds.`;
  }
  if (failure?.code === 'auth_required') return 'Spotify needs to be reconnected in Home Assistant.';
  if (failure?.code === 'forbidden') return 'This Home Assistant user cannot browse Spotify playlists.';
  if (failure?.code === 'not_configured') return 'Spotify playlists are not configured in Home Assistant.';
  return failure?.message || 'Could not load Spotify playlists. Try again.';
}
export function useSpotifyPlaylists(enabled: boolean) {
  const connection = useStore(state => state.connection);
  const online = useSyncExternalStore(subscribeSpeakerConnectionChanged, connected);
  const [items, setItems] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [previousEnabled, setPreviousEnabled] = useState(enabled);
  if (previousEnabled !== enabled) {
    setPreviousEnabled(enabled);
    setLoading(false);
    setLoadingMore(false);
  }
  const [error, setError] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const loadedAt = useRef<number | null>(null);
  const active = useRef<AbortController | null>(null);
  const failedOffset = useRef(0);
  const available = useRef(false);
  useLayoutEffect(() => {
    available.current = enabled && online;
  }, [enabled, online]);

  async function load(offset: number, refresh = false) {
    if (!available.current || !connected() || !connection || active.current) return;
    const request = new AbortController();
    active.current = request;
    failedOffset.current = offset;
    setLoading(offset === 0);
    setLoadingMore(offset > 0);
    setError('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const page = await Promise.race([
        connection.sendMessagePromise<SpotifyPlaylistPage>({
          type: 'dashboard_music/playlists',
          offset,
          limit: 50,
          ...(refresh ? { refresh: true } : {}),
        }),
        new Promise<never>((_, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
          timer = setTimeout(() => reject(new Error('Spotify playlists took too long to load. Try again.')), 15000);
        }),
      ]);
      if (request.signal.aborted || active.current !== request) return;
      if (
        !Array.isArray(page.items) ||
        !(page.nextOffset === null || (Number.isInteger(page.nextOffset) && page.nextOffset > offset && page.nextOffset <= 100000))
      ) {
        throw new Error('Could not read Spotify playlists. Refresh to try again.');
      }
      const valid = page.items.filter(
        item =>
          isSpotifyPlaybackContext(item.uri) &&
          item.uri !== LIKED_SONGS_URI &&
          typeof item.title === 'string' &&
          typeof item.owner === 'string'
      );
      setItems(previous => [...new Map([...(offset === 0 ? [] : previous), ...valid].map(item => [item.uri, item])).values()]);
      setNextOffset(page.nextOffset);
      loadedAt.current = Date.now();
    } catch (failure) {
      if (!request.signal.aborted && active.current === request) setError(libraryError(failure));
    } finally {
      clearTimeout(timer);
      if (active.current === request) {
        active.current = null;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }
  // Closing cancels only the read. Keep loaded choices so navigation is instant.
  useEffect(() => {
    const cancel = () => {
      active.current?.abort();
      active.current = null;
      setLoading(false);
      setLoadingMore(false);
      loadedAt.current = null;
    };
    const unsubscribe = onSpeakerDisconnect(cancel);
    return () => {
      unsubscribe();
      active.current?.abort();
      active.current = null;
    };
  }, []);
  useEffect(() => {
    if (enabled && online) {
      const stale = loadedAt.current !== null && Date.now() - loadedAt.current >= 60000;
      if (loadedAt.current === null || stale) void load(0, stale);
    }
    return () => {
      active.current?.abort();
      active.current = null;
    };
    // Loading is tied to the library's lifetime and socket, not each page update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, online, connection]);
  return {
    items,
    loading: enabled && online && loading,
    loadingMore: enabled && online && loadingMore,
    error,
    hasMore: nextOffset !== null,
    loadMore: () => {
      if (nextOffset !== null) void load(nextOffset);
    },
    refresh: () => {
      if (active.current) {
        active.current.abort();
        active.current = null;
      }
      void load(0, true);
    },
    retry: () => {
      void load(failedOffset.current, failedOffset.current === 0);
    },
  };
}

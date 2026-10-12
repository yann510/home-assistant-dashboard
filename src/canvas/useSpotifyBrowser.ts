import { useEffect, useState } from 'react';
import { useStore } from '@hakit/core';
import { onSpeakerDisconnect } from '../speakerConnection';
import type { FavouriteItem } from '../useSpeakerFavourites';
export type MusicItem = FavouriteItem & { subtitle?: string };
export type MusicView = 'home' | 'search' | 'library';
type Section = { title: string; items: MusicItem[] };
type Result = { key: string; sections: Section[]; categories: MusicItem[]; items: MusicItem[]; nextOffset: number | null; total: number; loading: boolean; error: string };
const searchErrors: Record<string, string> = {
  spotify_not_configured: 'Connect Spotify in Home Assistant to search your music.',
  spotify_auth_required: 'Reconnect Spotify in Home Assistant to search your music.',
  unauthorized: 'You need permission to use the Spotify player in Home Assistant.',
  unknown_command: 'Set up Spotify search in Home Assistant to search your music.',
  rate_limited: 'Spotify is busy. Wait before retrying your search.',
};
const empty = { sections: [], categories: [], items: [], nextOffset: null, total: 0 };
export function useSpotifyBrowser(entityId: string, enabled: boolean, view: MusicView, query: string, folder?: MusicItem) {
  const connection = useStore(state => state.connection);
  const status = useStore(state => state.connectionStatus);
  const key = JSON.stringify([entityId, enabled, view, query.trim(), folder?.media_content_id, connection?.connected, status]);
  const [result, setResult] = useState<Result>({ key: '', ...empty, loading: false, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState({ key, connection, offset: 0 });
  // Pagination belongs to one uninterrupted search session. Reset before a
  // returning key can reuse an old offset; keep failed-page retries in-session.
  const sameLifetime = page.key === key && page.connection === connection;
  if (!sameLifetime) setPage({ key, connection, offset: 0 });
  const offset = sameLifetime ? page.offset : 0;
  useEffect(() => {
    if (!enabled || !connection?.connected || status !== 'connected' || (view === 'search' && !query.trim())) return;
    let cancelled = false;
    const abort = new AbortController();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = onSpeakerDisconnect(() => {
      cancelled = true;
      abort.abort();
      setResult({ key, ...empty, loading: false, error: 'Connection lost. Retry when Home Assistant reconnects.' });
    });
    async function read<T>(message: { type: string; [key: string]: unknown }): Promise<T> {
      if (cancelled) throw new Error('Cancelled');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          connection!.sendMessagePromise<T>(message),
          new Promise<never>((_, reject) => {
            abort.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
            timer = setTimeout(() => reject(new Error('Request timed out')), 15000);
            timers.add(timer);
          }),
        ]);
      } finally { if (timer) { clearTimeout(timer); timers.delete(timer); } }
    }
    const browse = (item?: MusicItem) => read<MusicItem>({ type: 'media_player/browse_media', entity_id: entityId, ...(item ? { media_content_type: item.media_content_type, media_content_id: item.media_content_id } : {}) });
    setResult(old => ({ ...(offset && old.key === key ? old : { key, ...empty }), loading: true, error: '' }));
    async function load() {
      try {
        if (view === 'search') {
          const found = await read<{ items: MusicItem[]; total: number; next_offset: number | null }>({ type: 'dashboard_spotify/search', query: query.trim(), limit: 10, offset });
          if (!cancelled) setResult(old => ({ key, ...empty, items: [...new Map([...(offset && old.key === key ? old.items : []), ...found.items].map(item => [item.media_content_type + ':' + item.media_content_id, item])).values()], total: found.total, nextOffset: found.next_offset, loading: false, error: '' }));
        } else if (folder) {
          const found = await browse(folder);
          if (!cancelled) setResult({ key, ...empty, items: found.children ?? [], loading: false, error: '' });
        } else {
          const root = await browse();
          const spotify = root.children?.find(item => item.media_content_type === 'spotify://library' || /^spotify:\/\/[^/]+\/library$/.test(item.media_content_id));
          if (!spotify) throw new Error('Spotify library is unavailable on this speaker. Connect Spotify in Home Assistant.');
          const library = await browse(spotify);
          const categories = library.children ?? [];
          const personal = categories.filter(item => /\/(current_user_top_tracks|current_user_recently_played)$/.test(item.media_content_id));
          const sections = view === 'home' ? await Promise.all(personal.map(async item => ({ title: item.title, items: (await browse(item)).children ?? [] }))) : [];
          if (!cancelled) setResult({ key, ...empty, categories, sections, loading: false, error: '' });
        }
      } catch (error) {
        if (!cancelled) setResult(old => ({ ...old, loading: false, error: view === 'search' ? searchErrors[typeof error === 'object' && error && 'code' in error ? String(error.code) : ''] ?? 'Could not search Spotify. Please retry.' : error instanceof Error ? error.message : 'Could not load Spotify. Please retry.' }));
      }
    }
    const debounce = setTimeout(() => void load(), view === 'search' ? 350 : 0);
    return () => { cancelled = true; unsubscribe(); abort.abort(); clearTimeout(debounce); timers.forEach(clearTimeout); };
  }, [key, entityId, enabled, connection, status, view, query, folder, offset, attempt]);
  const current = result.key === key && enabled && connection?.connected && status === 'connected' ? result : { key, ...empty, loading: enabled && !!connection?.connected && status === 'connected' && (view !== 'search' || !!query.trim()), error: '' };
  return { ...current, retry: () => setAttempt(x => x + 1), more: () => { if (!current.loading && current.nextOffset !== null) setPage({ key, connection, offset: current.nextOffset }); } };
}

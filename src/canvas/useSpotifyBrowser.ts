import { useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { onSpeakerDisconnect } from '../speakerConnection';
import type { FavouriteItem } from '../useSpeakerFavourites';
export type MusicItem = FavouriteItem & { subtitle?: string; previewArtwork?: string[]; duration_ms?: number };
export type CatalogKind = 'all' | 'track' | 'playlist' | 'album' | 'artist';
export type CatalogPage = { kind: Exclude<CatalogKind, 'all'>; items: MusicItem[]; total: number; next_offset: number | null };
export type MusicView = 'home' | 'search' | 'library';
type Section = { title: string; category: MusicItem; items: MusicItem[]; error?: string };
type Result = { key: string; loadedOffset: number; groups: Partial<Record<CatalogPage['kind'], CatalogPage>>; sections: Section[]; categories: MusicItem[]; items: MusicItem[]; nextOffset: number | null; total: number; loading: boolean; error: string };
const searchErrors: Record<string, string> = {
  spotify_not_configured: 'Connect Spotify in Home Assistant to search your music.',
  spotify_auth_required: 'Reconnect Spotify in Home Assistant to search your music.',
  unauthorized: 'You need permission to use the Spotify player in Home Assistant.',
  unknown_command: 'Set up Spotify search in Home Assistant to search your music.',
  rate_limited: 'Spotify is busy. Wait before retrying your search.',
};
const empty = { loadedOffset: -1, groups: {} as Partial<Record<CatalogPage['kind'], CatalogPage>>, sections: [], categories: [], items: [], nextOffset: null, total: 0 };
export function useSpotifyBrowser(entityId: string, enabled: boolean, view: MusicView, query: string, folder?: MusicItem, kind: CatalogKind = 'track', targetOffset?: number) {
  const connection = useStore(state => state.connection);
  const status = useStore(state => state.connectionStatus);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const ready = () => setEpoch(value => value + 1);
    connection?.addEventListener?.('ready', ready);
    return () => connection?.removeEventListener?.('ready', ready);
  }, [connection]);
  const key = JSON.stringify([entityId, enabled, view, query.trim(), kind, folder?.media_content_id, connection?.connected, status, epoch]);
  const [result, setResult] = useState<Result>({ key: '', ...empty, loading: false, error: '' });
  const latest = useRef(result);
  useEffect(() => { latest.current = result; }, [result]);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState({ key, connection, offset: 0 });
  // Pagination belongs to one uninterrupted search session. Reset before a
  // returning key can reuse an old offset; keep failed-page retries in-session.
  const sameLifetime = page.key === key && page.connection === connection;
  if (!sameLifetime) setPage({ key, connection, offset: 0 });
  const offset = targetOffset ?? (sameLifetime ? page.offset : 0);
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
    setResult(old => ({ ...((offset || (view === 'home' && !folder)) && old.key === key ? old : { key, ...empty }), loading: true, error: '' }));
    async function load() {
      try {
        if (view === 'search') {
          const request = (position: number) => read<CatalogPage | { kind: 'all'; groups: Record<CatalogPage['kind'], CatalogPage> }>({ type: 'dashboard_spotify/search', query: query.trim(), kind, limit: 10, offset: position });
          const previous = latest.current;
          const append = targetOffset !== undefined && previous.key === key && previous.loadedOffset >= 0 && previous.loadedOffset < offset && previous.nextOffset !== null;
          let position = append ? previous.nextOffset! : targetOffset === undefined ? offset : 0;
          let found = await request(position);
          let items: MusicItem[] = 'groups' in found ? [] : [...(append ? previous.items : []), ...found.items];
          if (targetOffset !== undefined && !('groups' in found)) {
            // Rebuild the loaded range on history restoration, using the server's offsets.
            while (found.next_offset !== null && found.next_offset <= offset && found.next_offset > position && found.next_offset <= 10000) {
              position = found.next_offset;
              found = await request(position) as CatalogPage;
              items = [...items, ...found.items];
            }
          }
          if (!cancelled) {
            if ('groups' in found) setResult({ key, ...empty, groups: found.groups, loading: false, error: '' });
            else setResult(old => ({ key, ...empty, loadedOffset: position, items: [...new Map([...(targetOffset === undefined && offset && old.key === key ? old.items : []), ...items].map(item => [item.media_content_type + ':' + item.media_content_id, item])).values()], total: found.total, nextOffset: found.next_offset, loading: false, error: '' }));
          }
        } else if (folder) {
          const found = await browse(folder);
          if (!cancelled) setResult({ key, ...empty, items: found.children ?? [], loading: false, error: '' });
        } else {
          const root = await browse();
          const spotify = root.children?.find(item => item.media_content_type === 'spotify://library' || /^spotify:\/\/[^/]+\/library$/.test(item.media_content_id));
          if (!spotify) throw new Error('Spotify library is unavailable on this speaker. Connect Spotify in Home Assistant.');
          const library = await browse(spotify);
          const categories = library.children ?? [];
          const primaryIds = ['current_user_playlists', 'current_user_top_tracks', 'current_user_recently_played'];
          const primary = primaryIds.flatMap(id => categories.filter(item => item.media_content_id.endsWith('/' + id)));
          const sections: Section[] = view === 'home' ? await Promise.all(primary.map(async category => {
            try { return { title: category.title, category, items: ((await browse(category)).children ?? []).slice(0, 8) }; }
            catch { return { title: category.title, category, items: [], error: `Could not load ${category.title}.` }; }
          })) : [];
          // Only one level and four collection previews: never crawl playlists or
          // the complete saved-library tree just to paint the home page.
          const collections = view === 'home' ? categories.filter(item => !primary.includes(item)).slice(0, 4) : [];
          const previews = await Promise.all(collections.map(async category => {
            try {
              const children = (await browse(category)).children ?? [];
              return { ...category, previewArtwork: [...new Set(children.flatMap(item => item.thumbnail ? [item.thumbnail] : []))].slice(0, 4) };
            } catch { return category; } // The collection itself remains browsable.
          }));
          const enriched = categories.map(item => previews.find(preview => preview.media_content_id === item.media_content_id) ?? item);
          if (!cancelled) setResult({ key, ...empty, categories: enriched, sections, loading: false, error: '' });
        }
      } catch (error) {
        if (!cancelled) setResult(old => ({ ...old, loading: false, error: view === 'search' ? searchErrors[typeof error === 'object' && error && 'code' in error ? String(error.code) : ''] ?? 'Could not search Spotify. Please retry.' : error instanceof Error ? error.message : 'Could not load Spotify. Please retry.' }));
      }
    }
    const debounce = setTimeout(() => void load(), view === 'search' ? 350 : 0);
    return () => { cancelled = true; unsubscribe(); abort.abort(); clearTimeout(debounce); timers.forEach(clearTimeout); };
  }, [key, entityId, enabled, connection, status, view, query, folder, kind, targetOffset, offset, attempt]);
  const current = result.key === key && enabled && connection?.connected && status === 'connected' ? result : { key, ...empty, loading: enabled && !!connection?.connected && status === 'connected' && (view !== 'search' || !!query.trim()), error: '' };
  return { ...current, retry: () => setAttempt(x => x + 1), more: () => { if (!current.loading && current.nextOffset !== null) setPage({ key, connection, offset: current.nextOffset }); } };
}

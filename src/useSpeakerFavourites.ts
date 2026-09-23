import { useEffect, useState } from 'react';
import { useStore } from '@hakit/core';
import { onSpeakerDisconnect } from './speakerConnection';

export type FavouriteItem = {
  title: string;
  media_content_id: string;
  media_content_type: string;
  can_play?: boolean;
  can_expand?: boolean;
  thumbnail?: string;
  children?: FavouriteItem[];
};

export function useSpeakerFavourites(entityId: string, enabled = true, onCount?: (count: number | null) => void) {
  const connection = useStore(state => state.connection);
  const [items, setItems] = useState<FavouriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !connection) return;
    let cancelled = false;
    const abort = new AbortController();
    const unsubscribe = onSpeakerDisconnect(() => {
      cancelled = true;
      abort.abort();
      setLoading(false);
      setLoadError(true);
    });
    const timers = new Set<ReturnType<typeof setTimeout>>();
    async function read(type: string, id: string): Promise<FavouriteItem> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true })),
          connection!.sendMessagePromise<FavouriteItem>({
            type: 'media_player/browse_media',
            entity_id: entityId,
            media_content_type: type,
            media_content_id: id,
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Library timed out')), 15000);
            timers.add(timer);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        if (timer) timers.delete(timer);
      }
    }
    async function load() {
      setLoading(true);
      onCount?.(null);
      setLoadError(false);
      try {
        const found = new Map<string, FavouriteItem>();
        const visited = new Set<string>();
        async function visit(type: string, id: string, depth = 0) {
          const key = type + ':' + id;
          if (visited.has(key)) return;
          if (depth > 5 || visited.size >= 50) throw new Error('Too many favourite folders');
          visited.add(key);
          const result = await read(type, id);
          for (const item of result.children ?? []) {
            if (cancelled) return;
            if (item.can_play) found.set(item.media_content_type + ':' + item.media_content_id, item);
            else if (item.can_expand) await visit(item.media_content_type, item.media_content_id, depth + 1);
          }
        }
        await visit('favorites', '');
        if (!cancelled) {
          setItems([...found.values()]);
          onCount?.(found.size);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      unsubscribe();
      abort.abort();
      timers.forEach(clearTimeout);
    };
  }, [enabled, connection, entityId, attempt, onCount]);

  return { items, loading, error: loadError, retry: () => setAttempt(x => x + 1) };
}

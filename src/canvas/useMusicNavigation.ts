import { useState } from 'react';
import type { MusicItem } from './useSpotifyBrowser';

type Location = { query: string; folders: MusicItem[]; speakers: boolean; queue?: boolean };
type Entry = Location & { scroll: number };
type Source = { entityId: string; connection: unknown; connected: boolean };
const home: Location = { query: '', folders: [], speakers: false };

// Dialog-local history. A search session occupies one entry while it is typed.
export function useMusicNavigation(source: Source) {
  const [history, setHistory] = useState<{ entries: Entry[]; index: number; source: Source }>({ entries: [{ ...home, scroll: 0 }], index: 0, source });
  // Keep locations, but never revive another speaker/connection's scroll memory.
  if (history.source.entityId !== source.entityId || history.source.connection !== source.connection || history.source.connected !== source.connected) {
    setHistory({ ...history, entries: history.entries.map(entry => ({ ...entry, scroll: 0 })), source });
  }
  const current = history.entries[history.index];
  function navigate(location: Location, scroll: number, replace = false) {
    setHistory(old => {
      if ((location.queue && old.entries[old.index].queue) || (location.speakers && old.entries[old.index].speakers)) return old;
      const entries = old.entries.slice(0, old.index + 1);
      entries[old.index] = { ...entries[old.index], scroll };
      if (replace) entries[old.index] = { ...location, scroll: 0 };
      else entries.push({ ...location, scroll: 0 });
      return { ...old, entries, index: entries.length - 1 };
    });
  }
  function move(delta: number, scroll: number) {
    setHistory(old => {
      const index = old.index + delta;
      if (index < 0 || index >= old.entries.length) return old;
      const entries = [...old.entries];
      entries[old.index] = { ...entries[old.index], scroll };
      return { ...old, entries, index };
    });
  }
  return { current, canBack: history.index > 0, canForward: history.index < history.entries.length - 1,
    back: (scroll: number) => move(-1, scroll), forward: (scroll: number) => move(1, scroll),
    goHome: (scroll: number) => navigate(home, scroll),
    openFolder: (item: MusicItem, scroll: number) => navigate({ query: '', folders: [...current.folders, item], speakers: false }, scroll),
    breadcrumb: (index: number, scroll: number) => navigate({ query: '', folders: current.folders.slice(0, index + 1), speakers: false }, scroll),
    search: (query: string, scroll: number) => {
      if (!query.trim() && current.query.trim()) move(-1, scroll);
      else navigate({ query, folders: [], speakers: false }, scroll, !!current.query.trim());
    },
    openQueue: (scroll: number) => navigate({ query: '', folders: [], speakers: false, queue: true }, scroll),
    openSpeakers: (scroll: number) => navigate({ query: '', folders: [], speakers: true }, scroll),
  };
}

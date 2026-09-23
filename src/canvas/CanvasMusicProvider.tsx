import { createContext, useContext, useState, type ReactNode } from 'react';
import { useSpeakerSession } from '../useSpeakerSession';
import { useSpeakerRooms } from '../useSpeakerRooms';
import { useSpeakerTransport } from '../useSpeakerTransport';
import { useSpeakerFavourites } from '../useSpeakerFavourites';
import { useSpeakerFavouritePlayback } from '../useSpeakerFavouritePlayback';

function useCanvasMusicController() {
  const session = useSpeakerSession(true);
  const { coordinator, entityId, targets, connected } = session;
  const disabled = !connected || !coordinator || ['unknown', 'unavailable'].includes(coordinator.state);
  const rooms = useSpeakerRooms({ source: entityId, members: targets, disabled: disabled || session.busy });
  const playback = useSpeakerTransport(entityId, disabled);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const favourites = useSpeakerFavourites(entityId, libraryOpen && !disabled);
  const favouritePlayback = useSpeakerFavouritePlayback(entityId, disabled, () => {});
  const attributes = coordinator?.attributes;
  const playing = coordinator?.state === 'playing' || coordinator?.state === 'buffering';
  const idle = !playing && (coordinator?.state !== 'paused' || !(attributes?.media_title?.trim() || attributes?.media_playlist?.trim()));
  const title = disabled
    ? 'Speaker unavailable'
    : idle
      ? 'Ready to play'
      : attributes?.media_title || attributes?.media_playlist || 'Audio playing';
  // The ref is acquired synchronously by grouping, before React renders its busy state.
  // Guard the shared action itself so a retained callback cannot race manual handoff.
  async function updateFollowing(command: 'enable' | 'disable') {
    if (rooms.pending.current) return;
    await session.updateFollowing(command);
  }
  return {
    session: { ...session, updateFollowing },
    rooms,
    playback,
    favourites,
    favouritePlayback,
    setLibraryOpen,
    disabled,
    playing,
    idle,
    title,
    attributes,
  };
}
const MusicContext = createContext<ReturnType<typeof useCanvasMusicController> | null>(null);
export function CanvasMusicProvider({ children }: { children: ReactNode }) {
  const value = useCanvasMusicController();
  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}
// The consumer hook intentionally shares this provider’s private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useCanvasMusic() {
  const value = useContext(MusicContext);
  if (!value) throw new Error('Canvas music requires CanvasMusicProvider');
  return value;
}

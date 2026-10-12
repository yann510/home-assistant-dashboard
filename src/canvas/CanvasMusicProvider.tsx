import { createContext, useContext, useState, useRef, type ReactNode } from 'react';
import { useListening } from './useListening';
import { useSpeakerSession } from '../useSpeakerSession';
import { useSpeakerRooms } from '../useSpeakerRooms';
import { useSpeakerTransport } from '../useSpeakerTransport';
import { useSpeakerFavourites } from '../useSpeakerFavourites';
import { useSpeakerFavouritePlayback } from '../useSpeakerFavouritePlayback';

function useCanvasMusicController() {
  const session = useSpeakerSession(true);
  const { coordinator, entityId, targets, connected } = session;
  const disabled = !connected || !coordinator || ['unknown', 'unavailable'].includes(coordinator.state);
  const mutationPending = useRef(false);
  const rooms = useSpeakerRooms({ source: entityId, members: targets, disabled: disabled || session.busy, onSourceChanged: session.setPreferredSource, pinSource: session.pinSource, isBlocked: () => mutationPending.current });
  const playback = useSpeakerTransport(entityId, disabled || rooms.busy);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const favourites = useSpeakerFavourites(entityId, libraryOpen && !disabled);
  const favouritePlayback = useSpeakerFavouritePlayback(entityId, disabled || rooms.busy, () => {});
  const listening = useListening(entityId, !disabled, coordinator?.attributes.supported_features ?? 0, () => mutationPending.current || rooms.pending.current || rooms.busy || playback.busy || !!favouritePlayback.pending || session.busy, () => session.setPreferredSource(entityId), mutationPending);
  const attributes = coordinator?.attributes;
  const playing = coordinator?.state === 'playing' || coordinator?.state === 'buffering';
  const mediaTitle = attributes?.media_title?.trim() || attributes?.media_playlist?.trim() || null;
  const idle = !playing && (coordinator?.state !== 'paused' || !mediaTitle);
  const trackTitle = !disabled && !idle ? mediaTitle : null;
  const title = disabled ? 'Speaker unavailable' : (trackTitle ?? (playing ? 'Audio playing' : 'Nothing playing'));
  // The ref is acquired synchronously by grouping, before React renders its busy state.
  // Guard the shared action itself so a retained callback cannot race manual handoff.
  async function updateFollowing(command: 'enable' | 'disable') {
    if (rooms.pending.current || mutationPending.current) return;
    mutationPending.current = true;
    try { await session.updateFollowing(command); } finally { mutationPending.current = false; }
  }
  async function transport(...args: Parameters<typeof playback.transport>) {
    if (mutationPending.current || disabled || rooms.busy || playback.busy || favouritePlayback.pending || listening.pending.current || rooms.pending.current) return;
    // A manual transport command releases mood ownership on the server. Keep
    // the chosen player so its paused queue remains available to resume.
    mutationPending.current = true;
    session.setPreferredSource(entityId);
    try { await playback.transport(...args); } finally { mutationPending.current = false; }
  }
  async function playFavourite(...args: Parameters<typeof favouritePlayback.play>) {
    if (mutationPending.current || disabled || rooms.busy || favouritePlayback.pending || playback.busy || listening.pending.current || rooms.pending.current) return false;
    mutationPending.current = true;
    session.setPreferredSource(entityId);
    try { return await favouritePlayback.play(...args); } finally { mutationPending.current = false; }
  }
  return {
    session: { ...session, updateFollowing },
    rooms: { ...rooms, locked: rooms.locked || listening.busy || playback.busy || !!favouritePlayback.pending },
    playback: { ...playback, transport },
    listening,
    favourites,
    favouritePlayback: { ...favouritePlayback, play: playFavourite },
    setLibraryOpen,
    disabled: disabled || rooms.busy || listening.busy,
    playing,
    idle,
    trackTitle,
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

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSpeakerSession } from '../useSpeakerSession';
import { useSpeakerRooms } from '../useSpeakerRooms';
import { useSpeakerTransport } from '../useSpeakerTransport';
import { useSpotifyPlaylists } from '../useSpotifyPlaylists';
import { useSpotifyPlaylistPlayback } from '../useSpotifyPlaylistPlayback';

function useCanvasMusicController() {
  const session = useSpeakerSession(true);
  const { coordinator, entityId, targets, connected } = session;
  const disabled = !connected || !coordinator || ['unknown', 'unavailable'].includes(coordinator.state);
  const actionPending = useRef(false);
  const playlistPlayback = useSpotifyPlaylistPlayback(entityId, disabled || session.updating);
  const rooms = useSpeakerRooms({ source: entityId, members: targets, disabled: disabled || session.busy || !!playlistPlayback.pending, onSourceChanged: session.setPreferredSource, pinSource: session.pinSource });
  const playback = useSpeakerTransport(entityId, disabled || rooms.busy || !!playlistPlayback.pending);
  const latestStart = useRef({ source: entityId, blocked: true });
  useLayoutEffect(() => {
    latestStart.current = { source: entityId, blocked: disabled || rooms.busy || session.updating || playback.busy };
  }, [entityId, disabled, rooms.busy, session.updating, playback.busy]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const playlists = useSpotifyPlaylists(libraryOpen);
  const attributes = coordinator?.attributes;
  const playing = coordinator?.state === 'playing' || coordinator?.state === 'buffering';
  const mediaTitle = attributes?.media_title?.trim() || attributes?.media_playlist?.trim() || null;
  const idle = !playing && (coordinator?.state !== 'paused' || !mediaTitle);
  const trackTitle = !disabled && !idle ? mediaTitle : null;
  const title = disabled ? 'Speaker unavailable' : (trackTitle ?? (playing ? 'Audio playing' : 'Nothing playing'));
  // The ref is acquired synchronously by grouping, before React renders its busy state.
  // Guard the shared action itself so a retained callback cannot race manual handoff.
  async function updateFollowing(command: 'enable' | 'disable') {
    if (rooms.pending.current || actionPending.current) return;
    actionPending.current = true;
    try {
      await session.updateFollowing(command);
    } finally {
      actionPending.current = false;
    }
  }
  async function transport(...args: Parameters<typeof playback.transport>) {
    if (disabled || rooms.busy || playback.busy || rooms.pending.current || actionPending.current) return;
    // A manual transport command releases mood ownership on the server. Keep
    // the chosen player so its paused queue remains available to resume.
    session.setPreferredSource(entityId);
    actionPending.current = true;
    try {
      await playback.transport(...args);
    } finally {
      actionPending.current = false;
    }
  }
  async function playPlaylist(...args: Parameters<typeof playlistPlayback.play>) {
    if (latestStart.current.source !== entityId || latestStart.current.blocked || rooms.pending.current || actionPending.current) return false;
    actionPending.current = true;
    session.setPreferredSource(entityId);
    try {
      return await playlistPlayback.play(...args);
    } finally {
      actionPending.current = false;
    }
  }
  async function toggleRoom(...args: Parameters<typeof rooms.toggleRoom>) {
    if (actionPending.current) return;
    await rooms.toggleRoom(...args);
  }
  async function perform(...args: Parameters<typeof rooms.perform>) {
    if (actionPending.current) return;
    await rooms.perform(...args);
  }
  return {
    session: { ...session, updateFollowing },
    rooms: { ...rooms, toggleRoom, perform },
    playback: { ...playback, transport },
    playlists,
    playlistPlayback: { ...playlistPlayback, play: playPlaylist },
    setLibraryOpen,
    disabled: disabled || rooms.busy || !!playlistPlayback.pending,
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

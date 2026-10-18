import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '@hakit/core';
import { subscribeSpeakerConnectionChanged } from './speakerConnection';
import { spotifyTrackUri } from './canvas/spotifyTrackUri';
import type { SpotifySavedTrack } from './spotifyMusicTypes';

const connected = () => {
  const { connection, connectionStatus } = useStore.getState();
  return !!connection?.connected && connectionStatus === 'connected';
};
function savedError(error: unknown) {
  const failure = error as { code?: string };
  if (failure?.code === 'auth_required') return 'Spotify needs to be reconnected in Home Assistant.';
  if (failure?.code === 'forbidden') return 'This user cannot change Liked Songs.';
  if (failure?.code === 'rate_limited') return 'Spotify is busy. Wait a moment, then retry.';
  return 'Song saved state is uncertain. Retry to check Spotify.';
}
type SavedState = { saved: boolean | null; loading: boolean; pending: boolean; error: string | null };
const unknown: SavedState = { saved: null, loading: false, pending: false, error: null };
export function useSpotifyTrackSaved(trackUri: string | undefined, enabled: boolean) {
  const connection = useStore(state => state.connection);
  const online = useSyncExternalStore(subscribeSpeakerConnectionChanged, connected);
  const uri = enabled && online && spotifyTrackUri(trackUri) === trackUri ? trackUri : undefined;
  const scope = useRef<{ uri?: string; active?: AbortController; loadedAt: number | null; state: SavedState }>({
    loadedAt: null,
    state: unknown,
  });
  const [state, setState] = useState(unknown);
  const [identity, setIdentity] = useState({ uri, connection });
  if (identity.uri !== uri || identity.connection !== connection) {
    setIdentity({ uri, connection });
    setState(unknown);
  }
  function publish(value: SavedState) {
    scope.current.state = value;
    setState(value);
  }
  // Invalidate synchronously before a retained write callback or resolved promise can
  // affect another song. Cleanup cancels our wait, never replays a remote mutation.
  useLayoutEffect(() => {
    const generation = { uri, loadedAt: null, state: unknown };
    scope.current = generation;
    return () => {
      scope.current.active?.abort();
      if (scope.current === generation) scope.current = { loadedAt: null, state: unknown };
    };
  }, [uri, connection]);
  async function request(desired?: boolean): Promise<boolean> {
    const current = scope.current;
    const socket = useStore.getState().connection;
    if (!uri || current.uri !== uri || current.active || !connected() || socket !== connection) return false;
    if (desired !== undefined && current.state.saved === null) return false;
    const controller = new AbortController();
    current.active = controller;
    publish({ ...current.state, loading: desired === undefined, pending: desired !== undefined, error: null });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        socket!.sendMessagePromise<SpotifySavedTrack>({
          type: desired === undefined ? 'dashboard_music/track_saved' : 'dashboard_music/set_track_saved',
          track_uri: uri,
          ...(desired === undefined ? {} : { saved: desired }),
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
          timer = setTimeout(() => reject(new Error('Timed out')), 15000);
        }),
      ]);
      if (scope.current !== current || controller.signal.aborted || !connected() || useStore.getState().connection !== socket) return false;
      if (response.track_uri !== uri || typeof response.saved !== 'boolean' || (desired !== undefined && response.saved !== desired))
        throw new Error('Unconfirmed state');
      current.loadedAt = Date.now();
      publish({ saved: response.saved, loading: false, pending: false, error: null });
      return true;
    } catch (failure) {
      if (scope.current === current && !controller.signal.aborted) {
        current.loadedAt = Date.now();
        publish({ saved: null, loading: false, pending: false, error: savedError(failure) });
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (current.active === controller) current.active = undefined;
    }
  }
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      const loaded = scope.current.loadedAt;
      if (loaded === null || Date.now() - loaded >= 30000) void request();
    };
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void request();
    }, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
    // A scope owns its requests and listeners; state updates do not restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, connection]);
  const visible = uri ? state : unknown;
  return {
    ...visible,
    setSaved: (saved: boolean) => request(saved),
    retry: () => {
      void request();
    },
  };
}

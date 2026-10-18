import { useEffect, useState, useSyncExternalStore } from 'react';
import { useStore } from '@hakit/core';
import { subscribeSpeakerConnectionChanged } from './speakerConnection';
import { spotifyTrackUri } from './canvas/spotifyTrackUri';

type Player = { state: string; attributes: { source?: string; media_content_id?: unknown; media_title?: string; media_artist?: string } };
const connected = () => {
  const state = useStore.getState();
  return !!state.connection?.connected && state.connectionStatus === 'connected';
};
export function useSpotifyCurrentTrack(sourceEntity: string, player: Player | null | undefined, enabled: boolean): string | undefined {
  const connection = useStore(state => state.connection);
  const online = useSyncExternalStore(subscribeSpeakerConnectionChanged, connected);
  const attributes = player?.attributes;
  const source = attributes?.source?.trim().toLowerCase();
  const id = attributes?.media_content_id;
  const active = enabled && online && !!sourceEntity && ['playing', 'buffering', 'paused'].includes(player?.state ?? '');
  const spotifySource = source === 'spotify' || source === 'spotify connect';
  const direct = active && spotifySource ? spotifyTrackUri(id) : undefined;
  // Native Connect wrappers have no exact song URI. The authenticated backend
  // validates account, coordinator, fresh target identity and native session.
  const wrapper = active && (!source || spotifySource) && typeof id === 'string' && /^x-sonos-vli:.*:2,spotify:/.test(id);
  const key = JSON.stringify([sourceEntity, id, attributes?.media_title, attributes?.media_artist, source, player?.state, online, enabled]);
  const [resolved, setResolved] = useState<{ key: string; uri?: string }>();
  const [identity, setIdentity] = useState({ key, connection });
  if (identity.key !== key || identity.connection !== connection) {
    setIdentity({ key, connection });
    setResolved(undefined);
  }
  useEffect(() => {
    if (!wrapper || !connection) return;
    let cancelled = false;
    let pending = false;
    let loadedAt: number | null = null;
    let abort: (() => void) | undefined;
    async function refresh(force = false) {
      if (
        cancelled ||
        pending ||
        document.visibilityState === 'hidden' ||
        !connected() ||
        (!force && loadedAt !== null && Date.now() - loadedAt < 30000)
      )
        return;
      pending = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          connection!.sendMessagePromise<{ source_entity: string; track_uri: string | null }>({
            type: 'dashboard_music/current_track',
            source_entity: sourceEntity,
          }),
          new Promise<never>((_, reject) => {
            abort = () => reject(new Error('Cancelled'));
            timer = setTimeout(abort, 15000);
          }),
        ]);
        if (!cancelled)
          setResolved({ key, uri: response.source_entity === sourceEntity ? spotifyTrackUri(response.track_uri) : undefined });
      } catch {
        if (!cancelled) setResolved({ key });
      } finally {
        clearTimeout(timer);
        pending = false;
        loadedAt = Date.now();
        abort = undefined;
      }
    }
    void refresh();
    const listener = () => {
      void refresh();
    };
    const timer = setInterval(() => {
      void refresh(true);
    }, 30000);
    window.addEventListener('focus', listener);
    document.addEventListener('visibilitychange', listener);
    return () => {
      cancelled = true;
      abort?.();
      clearInterval(timer);
      window.removeEventListener('focus', listener);
      document.removeEventListener('visibilitychange', listener);
    };
  }, [key, wrapper, connection, sourceEntity]);
  return direct ?? (wrapper && resolved?.key === key ? resolved.uri : undefined);
}

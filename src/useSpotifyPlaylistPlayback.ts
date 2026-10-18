import { isSpotifyPlaybackContext } from './spotifyPlaybackContext';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { onSpeakerDisconnect } from './speakerConnection';
import type { SpotifyPlaylist, SpotifyPlayResult } from './spotifyMusicTypes';

let requestSequence = 0;
function requestId() {
  // The Fire dashboard is served over HTTP, where randomUUID may be absent.
  return (
    globalThis.crypto?.randomUUID?.() ??
    `dashboard-${Date.now().toString(36)}-${(++requestSequence).toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
const uncertainty = 'Playback could not be confirmed. Check Spotify and the speaker before trying again.';
export function useSpotifyPlaylistPlayback(sourceEntity: string, disabled: boolean) {
  const [pending, setPending] = useState<SpotifyPlaylist | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const active = useRef<AbortController | null>(null);
  const [stateSource, setStateSource] = useState(sourceEntity);
  if (stateSource !== sourceEntity) {
    setStateSource(sourceEntity);
    setPending(null);
    setError('');
    setStatus('');
  }
  const current = useRef({ sourceEntity, disabled });
  useLayoutEffect(() => {
    current.current = { sourceEntity, disabled };
  }, [sourceEntity, disabled]);
  useLayoutEffect(() => {
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [sourceEntity]);
  useEffect(
    () =>
      onSpeakerDisconnect(() => {
        if (active.current) {
          active.current.abort();
          active.current = null;
          setPending(null);
          setError('Connection interrupted. Check Spotify and the speaker before trying again.');
        }
        setStatus('');
      }),
    []
  );
  async function play(item: SpotifyPlaylist) {
    const { connection, connectionStatus } = useStore.getState();
    if (
      current.current.disabled ||
      current.current.sourceEntity !== sourceEntity ||
      !sourceEntity ||
      active.current ||
      !connection?.connected ||
      connectionStatus !== 'connected'
    )
      return false;
    if (!isSpotifyPlaybackContext(item.uri)) return false;
    const request = new AbortController();
    const id = requestId();
    active.current = request;
    setPending(item);
    setError('');
    setStatus('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        connection.sendMessagePromise<{ response?: SpotifyPlayResult }>({
          type: 'call_service',
          domain: 'dashboard_music',
          service: 'play_spotify',
          return_response: true,
          service_data: { playlist_uri: item.uri, source_entity: sourceEntity, request_id: id },
        }),
        new Promise<never>((_, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
          timer = setTimeout(() => reject(new Error(uncertainty)), 35000);
        }),
      ]);
      if (request.signal.aborted || active.current !== request) return false;
      const response = result.response;
      if (
        !response ||
        response.request_id !== id ||
        response.playlist_uri !== item.uri ||
        (response.source_entity !== undefined && response.source_entity !== sourceEntity)
      )
        throw new Error(uncertainty);
      if (['confirmed', 'already_playing'].includes(response.status) && response.source_entity === sourceEntity) {
        setStatus(`${response.status === 'already_playing' ? 'Already playing' : 'Playing'} ${item.title}.`);
        return true;
      }
      setError(
        response.message ||
          (response.status === 'busy' ? 'Another Spotify start is in progress. Try again after it finishes.' : uncertainty)
      );
    } catch (failure) {
      if (!request.signal.aborted && active.current === request) {
        const message = failure instanceof Error ? failure.message : '';
        setError(message && message !== uncertainty ? `${message} ${uncertainty}` : uncertainty);
      }
    } finally {
      clearTimeout(timer);
      if (active.current === request) {
        active.current = null;
        setPending(null);
      }
    }
    return false;
  }
  return { play, pending, error, status };
}

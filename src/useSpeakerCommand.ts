import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';

export type SpeakerService =
  | 'play_media'
  | 'media_play'
  | 'media_pause'
  | 'media_previous_track'
  | 'media_next_track'
  | 'media_seek'
  | 'volume_set'
  | 'volume_mute'
  | 'turn_on'
  | 'turn_off';

export function useSpeakerCommand() {
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    async (service: SpeakerService, targets: string[], description: string, data?: Record<string, string | number | boolean>) => {
      if (!mounted.current) return false;
      setError(null);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        // A queued volume change may outlive a disconnect/reconnect. Read the
        // current socket here instead of retaining the one from the gesture.
        const { connection, connectionStatus: status } = useStore.getState();
        if (!connection?.connected || status !== 'connected') throw new Error('Reconnecting to Home Assistant.');
        if (!targets.length) throw new Error('No speaker is available.');
        // The component library's service helper swallows rejections. Await the
        // authenticated socket directly so failed device commands reach the UI.
        await Promise.race([
          connection.sendMessagePromise({
            type: 'call_service',
            domain: 'media_player',
            service,
            target: { entity_id: [...new Set(targets)] },
            ...(data ? { service_data: data } : {}),
          }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('The speaker did not respond. Check its connection and try again.')), 15000);
          }),
        ]);
        return true;
      } catch (cause) {
        const detail = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Please try again.';
        if (mounted.current) setError(`Could not ${description}. ${detail}`);
        return false;
      } finally {
        clearTimeout(timeout);
      }
    },
    []
  );

  return { send, error };
}

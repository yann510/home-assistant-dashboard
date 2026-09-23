import { useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { onSpeakerDisconnect } from './speakerConnection';
import { useSpeakerCommand } from './useSpeakerCommand';
import type { FavouriteItem } from './useSpeakerFavourites';

export function useSpeakerFavouritePlayback(entityId: string, disabled: boolean, onClose: () => void) {
  const { send, error: commandError } = useSpeakerCommand();
  const [pending, setPending] = useState<FavouriteItem | null>(null);
  const [playError, setPlayError] = useState('');
  const inFlight = useRef(false);
  const cancelWait = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const generation = useRef({ value: 0 });
  const [playbackSource, setPlaybackSource] = useState(entityId);
  // A source change invalidates the old result without resetting navigation within one source.
  if (playbackSource !== entityId) {
    setPlaybackSource(entityId);
    setPending(null);
    setPlayError('');
  }
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    mounted.current = true;
    inFlight.current = false;
    const lifetime = generation.current;
    const unsubscribe = onSpeakerDisconnect(() => {
      cancelWait.current?.();
    });
    return () => {
      unsubscribe();
      mounted.current = false;
      lifetime.value++;
      cancelWait.current?.();
    };
  }, [entityId]);

  async function play(item: FavouriteItem) {
    if (disabled || inFlight.current) return;
    const request = generation.current.value;
    inFlight.current = true;
    setPending(item);
    setPlayError('');
    const before = useStore.getState().entities[entityId];
    let stop = () => {};
    const confirmation = new Promise<boolean>(resolve => {
      let done = false;
      const finish = (result: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(result);
      };
      const unsubscribe = useStore.subscribe(state => {
        const next = state.entities[entityId];
        if (next?.state !== 'playing') return;
        const a = next.attributes;
        if (
          before?.state !== 'playing' ||
          a.media_content_id !== before?.attributes.media_content_id ||
          a.media_title !== before?.attributes.media_title ||
          a.media_playlist !== before?.attributes.media_playlist
        )
          finish(true);
      });
      const timer = setTimeout(() => finish(false), 20000);
      stop = () => finish(false);
      cancelWait.current = stop;
    });
    const sent = await send('play_media', [entityId], 'start ' + item.title, {
      media_content_id: item.media_content_id,
      media_content_type: item.media_content_type,
    });
    if (!sent) stop();
    const confirmed = await confirmation;
    if (mounted.current && request === generation.current.value) {
      if (sent && confirmed) closeRef.current();
      else if (sent) setPlayError('Playback could not be confirmed. Tap a favourite to try again.');
      setPending(null);
    }
    if (request === generation.current.value) {
      cancelWait.current = null;
      inFlight.current = false;
    }
  }

  return { play, pending, playError, commandError };
}

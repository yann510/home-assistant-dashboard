import { useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { onSpeakerDisconnect } from './speakerConnection';
import { useSpeakerCommand } from './useSpeakerCommand';
import type { HassEntity } from 'home-assistant-js-websocket';
import type { FavouriteItem } from './useSpeakerFavourites';

const meaningfulId = (value: unknown): value is string =>
  typeof value === 'string' && Boolean(value.trim()) && !['unknown', 'unavailable'].includes(value);
const playbackIdentity = (entity: HassEntity | undefined) =>
  JSON.stringify([
    entity?.attributes.media_content_id,
    entity?.attributes.media_title,
    entity?.attributes.media_artist,
    entity?.attributes.media_playlist,
  ]);

export function useSpeakerFavouritePlayback(entityId: string, disabled: boolean, onClose: () => void) {
  const { send, error: commandError } = useSpeakerCommand(entityId);
  const [pending, setPending] = useState<FavouriteItem | null>(null);
  const [playError, setPlayError] = useState('');
  const [playStatus, setPlayStatus] = useState('');
  const statusIdentity = useRef<string | null>(null);
  const verified = useRef<{ source: string; favourite: string; identity: string } | null>(null);
  const inFlight = useRef(false);
  const [commandSource, setCommandSource] = useState<string | null>(entityId);
  const cancelWait = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const generation = useRef({ value: 0 });
  const [playbackSource, setPlaybackSource] = useState(entityId);
  // A source change invalidates the old result without resetting navigation within one source.
  if (playbackSource !== entityId) {
    setPlaybackSource(entityId);
    setPending(null);
    setPlayError('');
    setPlayStatus('');
  }
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    mounted.current = true;
    inFlight.current = false;
    statusIdentity.current = null;
    verified.current = null;
    const lifetime = generation.current;
    const unsubscribe = onSpeakerDisconnect(() => {
      verified.current = null;
      statusIdentity.current = null;
      setPlayStatus('');
      cancelWait.current?.();
    });
    const unsubscribePlayback = useStore.subscribe(state => {
      const entity = state.entities[entityId];
      const identity = playbackIdentity(entity);
      if (entity?.state !== 'playing' || (verified.current && verified.current.identity !== identity)) verified.current = null;
      if (statusIdentity.current !== null && (entity?.state !== 'playing' || statusIdentity.current !== identity)) {
        statusIdentity.current = null;
        setPlayStatus('');
      }
    });
    return () => {
      unsubscribePlayback();
      unsubscribe();
      mounted.current = false;
      lifetime.value++;
      cancelWait.current?.();
    };
  }, [entityId]);

  async function play(item: FavouriteItem) {
    if (disabled || inFlight.current) return false;
    const before = useStore.getState().entities[entityId];
    const favourite = JSON.stringify([item.media_content_type, item.media_content_id]);
    const connected = () => {
      const state = useStore.getState();
      return Boolean(state.connection?.connected && state.connectionStatus === 'connected');
    };
    const exactIdentity = meaningfulId(item.media_content_id) && before?.attributes.media_content_id === item.media_content_id;
    const observedIdentity =
      meaningfulId(before?.attributes.media_content_id) &&
      verified.current?.source === entityId &&
      verified.current.favourite === favourite &&
      verified.current.identity === playbackIdentity(before);
    if (connected() && before?.state === 'playing' && (exactIdentity || observedIdentity)) {
      setCommandSource(null);
      setPlayError('');
      statusIdentity.current = playbackIdentity(before);
      setPlayStatus(`Already playing ${item.title}.`);
      closeRef.current();
      return true;
    }
    const request = generation.current.value;
    setCommandSource(entityId);
    inFlight.current = true;
    setPending(item);
    setPlayError('');
    setPlayStatus('');
    statusIdentity.current = null;
    verified.current = null;
    let stop = () => {};
    let disconnected = false;
    let confirmedIdentity: string | null = null;
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
        ) {
          confirmedIdentity = playbackIdentity(next);
          finish(true);
        }
      });
      const timer = setTimeout(() => finish(false), 20000);
      stop = () => {
        disconnected = true;
        finish(false);
      };
      cancelWait.current = stop;
    });
    const sent = await send('play_media', [entityId], 'start ' + item.title, {
      media_content_id: item.media_content_id,
      media_content_type: item.media_content_type,
    });
    if (!sent) stop();
    const confirmed = await confirmation;
    const succeeded = mounted.current && request === generation.current.value && sent && confirmed && !disconnected && connected() && useStore.getState().entities[entityId]?.state === 'playing';
    if (mounted.current && request === generation.current.value) {
      if (succeeded) {
        verified.current = confirmedIdentity === playbackIdentity(useStore.getState().entities[entityId])
          ? { source: entityId, favourite, identity: confirmedIdentity! } : null;
        closeRef.current();
      } else if (sent && !disconnected && connected() && useStore.getState().entities[entityId]?.state === 'playing') {
        statusIdentity.current = playbackIdentity(useStore.getState().entities[entityId]);
        setPlayStatus('Request accepted; speaker is playing, but this favourite could not be verified. Tap a favourite to retry.');
      } else if (sent)
        setPlayError(
          disconnected || !connected()
            ? 'Speaker disconnected. Check its current state before trying again.'
            : 'Playback could not be confirmed. Tap a favourite to try again.'
        );
      setPending(null);
    }
    if (request === generation.current.value) {
      cancelWait.current = null;
      inFlight.current = false;
    }
    return succeeded;
  }

  return { play, pending, playError, playStatus, commandError: commandSource === entityId ? commandError : null };
}

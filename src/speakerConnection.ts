import { useStore } from '@hakit/core';

/** A HA socket reconnects in place; Zustand identity changes alone miss a lost connection. */
export function onSpeakerDisconnect(cancel: () => void) {
  let connection = useStore.getState().connection;
  const lost = () => cancel();
  connection?.addEventListener?.('disconnected', lost);
  const unsubscribe = useStore.subscribe(state => {
    if (state.connection !== connection) {
      connection?.removeEventListener?.('disconnected', lost);
      cancel();
      connection = state.connection;
      connection?.addEventListener?.('disconnected', lost);
    }
    if (!state.connection?.connected || state.connectionStatus !== 'connected') cancel();
  });
  return () => {
    unsubscribe();
    connection?.removeEventListener?.('disconnected', lost);
  };
}

/** Subscribe to the socket lifecycle as well as store updates for in-place reconnects. */
export function subscribeSpeakerConnectionChanged(changed: () => void) {
  let connection = useStore.getState().connection;
  function attach() {
    connection?.addEventListener?.('disconnected', changed);
    connection?.addEventListener?.('ready', changed);
  }
  function detach() {
    connection?.removeEventListener?.('disconnected', changed);
    connection?.removeEventListener?.('ready', changed);
  }
  attach();
  const unsubscribe = useStore.subscribe(state => {
    if (state.connection !== connection) {
      detach();
      connection = state.connection;
      attach();
    }
    changed();
  });
  return () => {
    detach();
    unsubscribe();
  };
}

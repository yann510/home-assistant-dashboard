import { useState } from 'react';
import { useStore } from '@hakit/core';
import { useDeviceCommand } from './useDeviceCommand';

function useMode(label: string, id: string) {
  const state = useStore(store => store.entities[id]?.state);
  const connected = useStore(store => Boolean(store.connection?.connected && store.connectionStatus === 'connected'));
  const { send, pending, result } = useDeviceCommand();
  const [dismissed, setDismissed] = useState(false);
  return {
    label,
    state,
    disabled: !connected || !['on', 'off'].includes(state) || pending || state === 'on',
    feedback: dismissed ? undefined : result?.results[0],
    dismiss: () => setDismissed(true),
    activate: () => {
      setDismissed(false);
      void send(
        { domain: 'input_boolean', service: 'turn_on', targets: [id] },
        target => useStore.getState().entities[target]?.state === 'on'
      );
    },
  };
}
export function useCanvasModes() {
  const day = useMode('Day', 'input_boolean.morning_mode');
  const night = useMode('Night', 'input_boolean.night_mode');
  return [day, night];
}

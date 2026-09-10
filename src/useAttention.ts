import { useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { parseAttention, type AttentionAction, type AttentionItem } from './attention';
export function useAttention() {
  const connection = useStore(s => s.connection);
  const connectionStatus = useStore(s => s.connectionStatus);
  const entity = useStore(s => s.entities['sensor.dashboard_attention']);
  const night = useStore(s => s.entities['input_boolean.night_mode']?.state === 'on');
  const connected = Boolean(connection?.connected && connectionStatus === 'connected');
  const ready = Boolean(entity && !['unknown', 'unavailable'].includes(entity.state) && entity.attributes.ready === true);
  const items = parseAttention(entity?.attributes);
  const [now, setNow] = useState(Date.now);
  const [disconnected, setDisconnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    let disconnectedAt: number | null = null;
    const update = () => {
      const current = Date.now();
      setNow(current);
      if (connected || document.visibilityState === 'hidden') {
        disconnectedAt = null;
        setDisconnected(false);
        return;
      }
      disconnectedAt ??= current;
      setDisconnected(current - disconnectedAt >= 15000);
    };
    update();
    const interval = setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, [connected]);
  async function onAction(action: AttentionAction, item: AttentionItem) {
    if (!connected || !connection || !ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await Promise.race([
        connection.sendMessagePromise({
          type: 'call_service',
          domain: 'dashboard_attention',
          service: action,
          service_data: { id: item.id, episode: item.episode },
        }),
        new Promise<never>((_, reject) => {
          timer.current = setTimeout(() => reject(new Error('Home Assistant did not confirm the change.')), 15000);
        }),
      ]);
    } catch {
      if (mounted.current) setError('Could not save this reminder. Check the connection and try again.');
    } finally {
      clearTimeout(timer.current);
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { items, connected, ready, disconnected, night, now, busy, error, onAction };
}

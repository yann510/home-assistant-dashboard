import { useSyncExternalStore } from 'react';

type HaState = {
  connection: {
    connected: boolean;
    sendMessage(message: unknown): void;
    sendMessagePromise<T = unknown>(message: unknown): Promise<T>;
  };
  connectionStatus: 'connected' | 'disconnected';
  entities: Record<string, { entity_id: string; state: string; attributes: Record<string, unknown> }>;
};

/** Controlled HAKit store substitute; never opens a Home Assistant connection. */
export function createHaFixture() {
  const calls: unknown[] = [];
  const makeConnection = (connected: boolean): HaState['connection'] => ({
    connected,
    sendMessage(message) {
      calls.push(message);
    },
    async sendMessagePromise<T>(message: unknown): Promise<T> {
      calls.push(message);
      return {} as T;
    },
  });
  let snapshot: HaState = { connection: makeConnection(true), connectionStatus: 'connected', entities: {} };
  const listeners = new Set<() => void>();
  const publishSnapshot = (next: HaState) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const getSnapshot = () => snapshot;
  return {
    get connection() {
      return snapshot.connection;
    },
    calls,
    publish(entityId: string, state: string, attributes: Record<string, unknown> = {}) {
      publishSnapshot({ ...snapshot, entities: { ...snapshot.entities, [entityId]: { entity_id: entityId, state, attributes } } });
    },
    disconnect() {
      publishSnapshot({ ...snapshot, connection: makeConnection(false), connectionStatus: 'disconnected' });
    },
    reconnect() {
      publishSnapshot({ ...snapshot, connection: makeConnection(true), connectionStatus: 'connected' });
    },
    useStore<T>(select: (state: HaState) => T): T {
      return select(useSyncExternalStore(subscribe, getSnapshot, getSnapshot));
    },
  };
}

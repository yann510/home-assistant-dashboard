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
  let responder: (message: unknown) => Promise<unknown> = () => Promise.resolve({});
  const makeConnection = (connected: boolean): HaState['connection'] => ({
    connected,
    sendMessage(message) {
      calls.push(message);
    },
    async sendMessagePromise<T>(message: unknown): Promise<T> {
      calls.push(message);
      return (await responder(message)) as T;
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
    getState: getSnapshot,
    subscribe,
    get listenerCount() {
      return listeners.size;
    },
    respondWith(response: (message: unknown) => Promise<unknown>) {
      responder = response;
    },
    reset() {
      calls.length = 0;
      responder = () => Promise.resolve({});
      publishSnapshot({ connection: makeConnection(true), connectionStatus: 'connected', entities: {} });
    },
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

export function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

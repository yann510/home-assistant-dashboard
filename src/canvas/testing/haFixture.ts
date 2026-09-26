import { useSyncExternalStore } from 'react';

type HaState = {
  config: { time_zone: string; unit_system: { temperature: string } };
  connection: {
    connected: boolean;
    addEventListener(event: 'disconnected' | 'ready', listener: () => void): void;
    removeEventListener(event: 'disconnected' | 'ready', listener: () => void): void;
    subscribeMessage(callback: (event: unknown) => void, message: unknown): Promise<() => Promise<void>>;
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
  const socketListeners = new Map<string, Set<() => void>>();
  const makeConnection = (connected: boolean): HaState['connection'] => ({
    connected,
    addEventListener(event, listener) {
      if (!socketListeners.has(event)) socketListeners.set(event, new Set());
      socketListeners.get(event)!.add(listener);
    },
    removeEventListener(event, listener) {
      socketListeners.get(event)?.delete(listener);
    },
    async subscribeMessage(callback, message) {
      calls.push(message);
      const response = await responder(message);
      callback(response);
      return async () => {};
    },
    sendMessage(message) {
      calls.push(message);
    },
    async sendMessagePromise<T>(message: unknown): Promise<T> {
      calls.push(message);
      return (await responder(message)) as T;
    },
  });
  let snapshot: HaState = {
    connection: makeConnection(true),
    connectionStatus: 'connected',
    entities: {},
    config: { time_zone: 'America/Toronto', unit_system: { temperature: '°C' } },
  };
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
    socketDisconnect() {
      snapshot.connection.connected = false;
      socketListeners.get('disconnected')?.forEach(listener => listener());
    },
    socketReconnect() {
      snapshot.connection.connected = true;
      socketListeners.get('ready')?.forEach(listener => listener());
    },
    get socketListenerCount() {
      return [...socketListeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
    },
    getState: getSnapshot,
    subscribe,
    get listenerCount() {
      return listeners.size;
    },
    respondWith(response: (message: unknown) => Promise<unknown>) {
      responder = response;
    },
    respondInOrder(...responses: readonly Promise<unknown>[]) {
      const pending = [...responses];
      responder = () => pending.shift() ?? Promise.reject(new Error('Unexpected Home Assistant call'));
    },
    reset() {
      calls.length = 0;
      responder = () => Promise.resolve({});
      publishSnapshot({
        connection: makeConnection(true),
        connectionStatus: 'connected',
        entities: {},
        config: { time_zone: 'America/Toronto', unit_system: { temperature: '°C' } },
      });
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

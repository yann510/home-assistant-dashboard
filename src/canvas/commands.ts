export type CommandPhase = 'pending' | 'accepted' | 'observed' | 'failed' | 'unconfirmed';
export type DeviceIntent = {
  domain: string;
  service: string;
  targets: readonly string[];
  data?: Record<string, unknown>;
  /** Explicit correlation for services with no entity target (e.g. a blind room). */
  resultTarget?: string;
};
export type TargetResult = { target: string; phase: CommandPhase; message?: string };
export type CommandResult = { results: TargetResult[] };
export type SendCommand = (intent: DeviceIntent, observe?: (entityId: string) => boolean) => Promise<CommandResult>;
export type CommandStore = {
  getState(): {
    connection: { connected: boolean; sendMessagePromise<T = unknown>(message: Record<string, unknown>): Promise<T> } | null;
    connectionStatus: string;
    entities: Record<string, unknown>;
  };
  subscribe(listener: () => void): () => void;
};
const TIMEOUT = 15000;

export function captureIntent(intent: DeviceIntent): DeviceIntent {
  if (!intent.targets.length && !intent.resultTarget?.trim()) throw new Error('Select at least one target.');
  if (intent.targets.length && intent.resultTarget !== undefined) throw new Error('Targetless correlation cannot include entity targets.');
  if (intent.targets.some(target => !target.trim())) throw new Error('Invalid empty target.');
  return { ...intent, targets: [...new Set(intent.targets)], data: structuredClone(intent.data ?? {}) };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  return value;
}
export function intentKey(intent: DeviceIntent): string {
  return JSON.stringify(canonical(intent));
}

/** Each target owns its acknowledgement/observation deadline and connection epoch. */
export async function executeCommand(
  input: DeviceIntent,
  store: CommandStore,
  observe?: (entityId: string) => boolean,
  signal?: AbortSignal,
  onChange?: (result: CommandResult) => void
): Promise<CommandResult> {
  const intent = captureIntent(input);
  const targets = intent.targets.length ? intent.targets : [intent.resultTarget!];
  const results: TargetResult[] = targets.map(target => ({ target, phase: 'pending' }));
  const update = (index: number, value: TargetResult) => {
    results[index] = value;
    onChange?.({ results: results.map(result => ({ ...result })) });
  };
  await Promise.all(
    targets.map(
      (target, index) =>
        new Promise<void>(resolve => {
          let done = false;
          let accepted = false;
          let timer: ReturnType<typeof setTimeout> | undefined;
          let unsubscribe = () => {};
          const finish = (phase: CommandPhase, message?: string) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            unsubscribe();
            signal?.removeEventListener('abort', cancel);
            update(index, { target, phase, ...(message ? { message } : {}) });
            resolve();
          };
          const cancel = () => finish('unconfirmed', 'Stopped waiting for this command. Check the device before trying again.');
          if (signal?.aborted) {
            cancel();
            return;
          }
          const initial = store.getState();
          const connection = initial.connection;
          if (!connection?.connected || initial.connectionStatus !== 'connected') {
            finish('failed', 'Home Assistant is disconnected. Reconnect before trying again.');
            return;
          }
          if (intent.targets.length && !initial.entities[target]) {
            finish('failed', 'This entity is missing. Refresh the device list before trying again.');
            return;
          }
          const reconcile = () => {
            if (done) return;
            const current = store.getState();
            if (current.connection !== connection || !connection.connected || current.connectionStatus !== 'connected') {
              finish('unconfirmed', 'Connection changed while waiting. Check the device before trying again.');
              return;
            }
            if (accepted && observe && intent.targets.length) {
              if (!current.entities[target]) {
                finish('unconfirmed', 'The entity disappeared. Refresh its state before trying again.');
                return;
              }
              try {
                if (observe(target)) finish('observed');
              } catch {
                finish('unconfirmed', 'Could not verify the device state. Refresh before trying again.');
              }
            }
          };
          unsubscribe = store.subscribe(reconcile);
          signal?.addEventListener('abort', cancel, { once: true });
          timer = setTimeout(
            () => finish('unconfirmed', 'No service acknowledgement within 15 seconds. Check the device before trying again.'),
            TIMEOUT
          );
          // Read immediately before dispatch; never enqueue or replay an old intent on reconnect.
          reconcile();
          if (done) return;
          try {
            const acknowledgement = connection.sendMessagePromise({
              type: 'call_service',
              domain: intent.domain,
              service: intent.service,
              ...(intent.targets.length ? { target: { entity_id: [target] } } : {}),
              service_data: structuredClone(intent.data),
            });
            Promise.resolve(acknowledgement).then(
              () => {
                if (done) return;
                reconcile();
                if (done) return;
                accepted = true;
                clearTimeout(timer);
                if (!observe || !intent.targets.length) {
                  finish('accepted');
                  return;
                }
                update(index, { target, phase: 'accepted' });
                timer = setTimeout(
                  () =>
                    finish(
                      'unconfirmed',
                      'Service accepted, but the requested device state was not reported within 15 seconds. Check the device before trying again.'
                    ),
                  TIMEOUT
                );
                reconcile();
              },
              error => {
                if (done) return;
                const detail =
                  error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Service rejected the command.';
                finish('failed', `${detail} Check the device and try again.`);
              }
            );
          } catch (error) {
            finish('failed', error instanceof Error ? error.message : 'Could not send the command. Try again.');
          }
        })
    )
  );
  return { results: results.map(result => ({ ...result })) };
}

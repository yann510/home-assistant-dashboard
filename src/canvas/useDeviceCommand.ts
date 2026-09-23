import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { captureIntent, executeCommand, intentKey, type CommandResult, type SendCommand } from './commands';

export function useDeviceCommand() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const inFlight = useRef(new Map<number, { key: string; promise: Promise<CommandResult>; controller: AbortController }>());
  useEffect(() => {
    mounted.current = true;
    const requests = inFlight.current;
    return () => {
      mounted.current = false;
      requests.forEach(request => request.controller.abort());
      requests.clear();
    };
  }, []);
  const send = useCallback<SendCommand>((input, observe) => {
    let intent;
    try {
      intent = captureIntent(input);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!mounted.current)
      return Promise.resolve({
        results: [...intent.targets, ...(intent.resultTarget ? [intent.resultTarget] : [])].map(target => ({
          target,
          phase: 'unconfirmed',
          message: 'This control has closed. Check the device before trying again.',
        })),
      });
    const key = intentKey(intent);
    const duplicate = inFlight.current.get(generation.current);
    if (duplicate?.key === key) return duplicate.promise;
    const current = ++generation.current;
    const controller = new AbortController();
    setPending(true);
    setResult({ results: (intent.targets.length ? intent.targets : [intent.resultTarget!]).map(target => ({ target, phase: 'pending' })) });
    const publish = (next: CommandResult) => {
      if (mounted.current && !controller.signal.aborted && generation.current === current) setResult(next);
    };
    const promise = executeCommand(intent, useStore, observe, controller.signal, publish)
      .then(next => {
        publish(next);
        return next;
      })
      .finally(() => {
        inFlight.current.delete(current);
        if (mounted.current) setPending(inFlight.current.size > 0);
      });
    inFlight.current.set(current, { key, promise, controller });
    return promise;
  }, []);
  return { send, pending, result };
}

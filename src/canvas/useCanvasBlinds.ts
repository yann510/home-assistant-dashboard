import { useCallback, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { useDeviceCommand } from './useDeviceCommand';
import type { CommandResult, TargetResult } from './commands';

export type BlindRoom = 'living room' | 'bedroom' | 'gym';
export type BlindAction = 'open' | 'stop' | 'close';
export const blindRooms: readonly BlindRoom[] = ['living room', 'bedroom', 'gym'];
const emptyResults = (): Record<BlindAction, CommandResult | null> => ({ open: null, stop: null, close: null });
const emptyFailures = (): Record<BlindAction, readonly BlindRoom[]> => ({ open: [], stop: [], close: [] });

export function useCanvasBlinds(initialRoom?: BlindRoom) {
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const [selection, setSelection] = useState<readonly BlindRoom[]>(() => initialRoom ? [initialRoom] : blindRooms);
  const selectionRef = useRef<readonly BlindRoom[]>(initialRoom ? [initialRoom] : blindRooms);
  const [results, setResults] = useState(emptyResults);
  const resultsRef = useRef(emptyResults());
  const [failedRooms, setFailedRooms] = useState(emptyFailures);
  const failedRef = useRef(emptyFailures());
  const [movingRooms, setMovingRooms] = useState<readonly BlindRoom[]>([]);
  const movingRef = useRef<readonly BlindRoom[]>([]);
  const [pending, setPending] = useState<Record<BlindAction, boolean>>({ open: false, stop: false, close: false });
  const busyRef = useRef<Record<BlindAction, boolean>>({ open: false, stop: false, close: false });
  const { send: sendMovement } = useDeviceCommand();
  const { send: sendStop } = useDeviceCommand();

  const toggleRoom = useCallback((room: BlindRoom) => {
    const next = selectionRef.current.includes(room)
      ? selectionRef.current.filter(item => item !== room)
      : blindRooms.filter(item => selectionRef.current.includes(item) || item === room);
    selectionRef.current = next;
    setSelection(next);
  }, []);

  const publishResults = useCallback((action: BlindAction, outcome: CommandResult) => {
    resultsRef.current = { ...resultsRef.current, [action]: outcome };
    setResults(resultsRef.current);
  }, []);

  const dispatch = useCallback(async (action: BlindAction, targets: readonly BlindRoom[], retry = false): Promise<CommandResult> => {
    if (!targets.length || !connected || busyRef.current[action] || (action !== 'stop' && (busyRef.current.open || busyRef.current.close)))
      return { results: [] };
    // Snapshot the action targets before any service call can settle or selection can change.
    const captured = [...targets];
    busyRef.current[action] = true;
    setPending(previous => ({ ...previous, [action]: true }));
    if (action !== 'stop') {
      movingRef.current = captured;
      setMovingRooms(captured);
    }
    failedRef.current = { ...failedRef.current, [action]: [] };
    setFailedRooms(failedRef.current);
    const pendingResults: TargetResult[] = captured.map(target => ({ target, phase: 'pending' }));
    const previousResults = resultsRef.current[action]?.results ?? [];
    publishResults(action, { results: retry
      ? previousResults.map(result => captured.includes(result.target as BlindRoom)
        ? { target: result.target, phase: 'pending' } : result)
      : pendingResults });
    const send = action === 'stop' ? sendStop : sendMovement;
    try {
      await Promise.all(captured.map(async room => {
        let item: TargetResult;
        try {
          const result = await send({
            domain: 'google_assistant_sdk', service: 'send_text_command', targets: [],
            resultTarget: room, data: { command: `${action} all the blinds ${room}` },
          });
          item = result.results[0];
        } catch (error) {
          item = { target: room, phase: 'failed', message: error instanceof Error ? error.message : 'Could not send the command. Try again.' };
        }
        publishResults(action, { results: resultsRef.current[action]!.results.map(result => result.target === room ? item : result) });
        return item;
      }));
      const outcome = resultsRef.current[action]!;
      failedRef.current = { ...failedRef.current, [action]: outcome.results.filter(item => item.phase === 'failed').map(item => item.target as BlindRoom) };
      setFailedRooms(failedRef.current);
      return outcome;
    } finally {
      busyRef.current[action] = false;
      setPending(previous => ({ ...previous, [action]: false }));
      if (action !== 'stop') {
        movingRef.current = [];
        setMovingRooms([]);
      }
    }
  }, [connected, publishResults, sendMovement, sendStop]);

  const run = useCallback((action: BlindAction) => dispatch(action,
    action === 'stop' && movingRef.current.length ? movingRef.current : selectionRef.current), [dispatch]);
  const retryFailed = useCallback((action: BlindAction) => dispatch(action, failedRef.current[action], true), [dispatch]);
  return { selection, toggleRoom, run, retryFailed, failedRooms, results, pending, movingRooms, connected };
}

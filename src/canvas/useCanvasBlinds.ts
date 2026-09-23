import { useCallback, useRef, useState } from 'react';
import { useStore } from '@hakit/core';
import { useDeviceCommand } from './useDeviceCommand';
import type { CommandResult, TargetResult } from './commands';

export type BlindRoom = 'living room' | 'bedroom' | 'gym';
export type BlindAction = 'open' | 'stop' | 'close';
export const blindRooms: readonly BlindRoom[] = ['living room', 'bedroom', 'gym'];
const emptyResults = (): Record<BlindAction, CommandResult | null> => ({ open: null, stop: null, close: null });
const emptyFailures = (): Record<BlindAction, readonly BlindRoom[]> => ({ open: [], stop: [], close: [] });

export function useCanvasBlinds() {
  const connected = useStore(state => Boolean(state.connection?.connected && state.connectionStatus === 'connected'));
  const [selection, setSelection] = useState<readonly BlindRoom[]>(blindRooms);
  const selectionRef = useRef<readonly BlindRoom[]>(blindRooms);
  const [results, setResults] = useState(emptyResults);
  const [failedRooms, setFailedRooms] = useState(emptyFailures);
  const failedRef = useRef(emptyFailures());
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

  const dispatch = useCallback(async (action: BlindAction, targets: readonly BlindRoom[]): Promise<CommandResult> => {
    if (!targets.length || !connected || busyRef.current[action] || (action !== 'stop' && (busyRef.current.open || busyRef.current.close)))
      return { results: [] };
    // Snapshot the action targets before any service call can settle or selection can change.
    const captured = [...targets];
    busyRef.current[action] = true;
    setPending(previous => ({ ...previous, [action]: true }));
    failedRef.current = { ...failedRef.current, [action]: [] };
    setFailedRooms(failedRef.current);
    setResults(previous => ({ ...previous, [action]: { results: captured.map(target => ({ target, phase: 'pending' })) } }));
    const send = action === 'stop' ? sendStop : sendMovement;
    try {
      const perRoom = await Promise.all(captured.map(async room => {
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
        setResults(previous => ({ ...previous, [action]: { results: previous[action]!.results.map(result => result.target === room ? item : result) } }));
        return item;
      }));
      const outcome = { results: perRoom } satisfies CommandResult;
      failedRef.current = { ...failedRef.current, [action]: perRoom.filter(item => item.phase === 'failed').map(item => item.target as BlindRoom) };
      setFailedRooms(failedRef.current);
      setResults(previous => ({ ...previous, [action]: outcome }));
      return outcome;
    } finally {
      busyRef.current[action] = false;
      setPending(previous => ({ ...previous, [action]: false }));
    }
  }, [connected, sendMovement, sendStop]);

  const run = useCallback((action: BlindAction) => dispatch(action, selectionRef.current), [dispatch]);
  const retryFailed = useCallback((action: BlindAction) => dispatch(action, failedRef.current[action]), [dispatch]);
  return { selection, toggleRoom, run, retryFailed, failedRooms, results, pending, connected };
}

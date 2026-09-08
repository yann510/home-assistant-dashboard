// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHouseMood } from './useHouseMood';
type MockState = {
  connection: { connected: boolean; sendMessagePromise: ReturnType<typeof vi.fn> };
  connectionStatus: string;
  entities: Record<string, { state: string; attributes: Record<string, unknown> }>;
};
const fake = vi.hoisted(() => ({ state: {} as MockState, listeners: new Set<() => void>(), send: vi.fn() }));
vi.mock('@hakit/core', () => ({
  useStore: (selector: (s: MockState) => unknown) =>
    useSyncExternalStore(
      cb => {
        fake.listeners.add(cb);
        return () => {
          fake.listeners.delete(cb);
        };
      },
      () => selector(fake.state)
    ),
}));
function update(phase: string, attributes: Record<string, unknown> = {}) {
  fake.state = { ...fake.state, entities: { 'sensor.house_mood': { state: phase, attributes } } };
  fake.listeners.forEach(l => l());
}
beforeEach(() => {
  fake.send.mockReset();
  fake.listeners.clear();
  fake.state = { connection: { connected: true, sendMessagePromise: fake.send }, connectionStatus: 'connected', entities: {} };
  update('idle');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('House mood connection', () => {
  it('locks immediately and sends one authenticated service request for double taps', async () => {
    fake.send.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHouseMood());
    act(() => {
      result.current.onActivate('love');
      result.current.onActivate('party');
    });
    expect(result.current.status.phase).toBe('starting');
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect(fake.send).toHaveBeenCalledWith({
      type: 'call_service',
      domain: 'house_moods',
      service: 'activate',
      return_response: true,
      service_data: { mood: 'love' },
    });
  });
  it('uses server status after activation and never restarts an active mood', async () => {
    fake.send.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHouseMood());
    act(() => result.current.onActivate('love'));
    act(() => update('active', { active_mood: 'love' }));
    expect(result.current.status.activeMood).toBe('love');
    act(() => result.current.onActivate('love'));
    expect(fake.send).toHaveBeenCalledTimes(1);
  });
  it('keeps an uncertain timeout locked until a fresh server status arrives', async () => {
    vi.useFakeTimers();
    fake.send.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHouseMood());
    act(() => result.current.onActivate('love'));
    await act(async () => vi.advanceTimersByTimeAsync(35000));
    expect(result.current.status.phase).toBe('starting');
    expect(result.current.status.errors[0]?.message).toMatch(/confirm/i);
    act(() => result.current.onActivate('party'));
    expect(fake.send).toHaveBeenCalledTimes(1);
    act(() => update('recovery_required', { errors: [{ target: 'neon', message: 'Restore neon.' }] }));
    expect(result.current.status.phase).toBe('recovery_required');
    expect(result.current.status.errors[0]?.message).toBe('Restore neon.');
  });
  it('accepts a terminal response after an intermediate sensor event', async () => {
    let finish!: (value: unknown) => void;
    fake.send.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useHouseMood());
    act(() => result.current.onActivate('love'));
    act(() => update('starting', { pending_mood: 'love' }));
    await act(async () => finish({ response: { success: true, phase: 'active', errors: [] } }));
    expect(result.current.status.phase).toBe('active');
    expect(result.current.status.activeMood).toBe('love');
  });
  it('keeps a terminal sensor update authoritative over a late response', async () => {
    let finish!: (value: unknown) => void;
    fake.send.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useHouseMood());
    act(() => result.current.onActivate('love'));
    act(() => update('recovery_required', { errors: [{ target: 'neon', message: 'Restore neon.' }] }));
    await act(async () => finish({ response: { success: true, phase: 'active', errors: [] } }));
    expect(result.current.status.phase).toBe('recovery_required');
  });
  it('stays unavailable when the status entity has never existed', () => {
    fake.state = { ...fake.state, entities: {} };
    const { result } = renderHook(() => useHouseMood());
    expect(result.current.available).toBe(false);
    expect(result.current.status.phase).toBe('idle');
  });
  it('does not invent a usable backend from missing or malformed status', () => {
    act(() => update('unknown'));
    const { result } = renderHook(() => useHouseMood());
    expect(result.current.available).toBe(false);
    act(() => result.current.onActivate('love'));
    expect(fake.send).not.toHaveBeenCalled();
  });
  it('shows a rejected preflight without turning it into a restoration command', async () => {
    fake.send.mockResolvedValue({
      response: { success: false, phase: 'idle', errors: [{ target: 'favorite', message: 'Crush Radio is missing.' }] },
    });
    const { result } = renderHook(() => useHouseMood());
    await act(async () => result.current.onActivate('love'));
    expect(result.current.status.phase).toBe('idle');
    expect(result.current.status.errors[0]?.message).toBe('Crush Radio is missing.');
  });
  it('sends recovery only when the backend reports a recoverable session', async () => {
    act(() => update('recovery_required', { errors: [] }));
    fake.send.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHouseMood());
    act(() => result.current.onActivate('party'));
    expect(fake.send).not.toHaveBeenCalled();
    act(() => result.current.onRetry());
    expect(fake.send.mock.calls[0][0].service).toBe('retry_restoration');
    expect(result.current.status.phase).toBe('restoring');
  });
});

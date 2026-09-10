// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAttention } from './useAttention';
const store = vi.hoisted(() => ({
  connection: { connected: true, sendMessagePromise: vi.fn() },
  connectionStatus: 'connected',
  entities: {} as Record<string, unknown>,
}));
vi.mock('@hakit/core', () => ({ useStore: (selector: (s: typeof store) => unknown) => selector(store) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  store.connection.connected = true;
  store.connectionStatus = 'connected';
  store.entities = {};
  store.connection.sendMessagePromise.mockReset();
});
const item = {
  id: 'dryer',
  episode: 'dryer-1',
  title: 'Dryer finished',
  detail: 'Cycle complete',
  tone: 'blue',
  icon: 'dryer',
  target: 'appliances',
  kind: 'completion',
  occurred_at: '2026-09-10T00:00:00Z',
  snoozed_until: null,
  snooze_seconds: 3600,
};
describe('attention subscription', () => {
  it('sends episode-bound actions, retains server state, and exposes failures', async () => {
    store.entities = { 'sensor.dashboard_attention': { state: '1', attributes: { ready: true, items: [item] } } };
    store.connection.sendMessagePromise.mockRejectedValue(new Error('Storage failed'));
    const { result } = renderHook(() => useAttention());
    await act(() => result.current.onAction('dismiss', result.current.items[0]));
    expect(store.connection.sendMessagePromise).toHaveBeenCalledWith({
      type: 'call_service',
      domain: 'dashboard_attention',
      service: 'dismiss',
      service_data: { id: 'dryer', episode: 'dryer-1' },
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toContain('Could not save');
    expect(result.current.busy).toBe(false);
  });
  it('waits fifteen visible seconds before connection banner and rejects disconnected actions', async () => {
    vi.useFakeTimers();
    store.connection.connected = false;
    store.connectionStatus = 'disconnected';
    const { result } = renderHook(() => useAttention());
    expect(result.current.disconnected).toBe(false);
    act(() => vi.advanceTimersByTime(15000));
    expect(result.current.disconnected).toBe(true);
    await act(() => result.current.onAction('dismiss', item as never));
    expect(store.connection.sendMessagePromise).not.toHaveBeenCalled();
  });
  it('bounds stalled service requests and prevents duplicate actions', async () => {
    vi.useFakeTimers();
    store.entities = { 'sensor.dashboard_attention': { state: '1', attributes: { ready: true, items: [item] } } };
    store.connection.sendMessagePromise.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useAttention());
    let promise: Promise<void>;
    act(() => {
      promise = result.current.onAction('dismiss', result.current.items[0]);
    });
    await act(() => result.current.onAction('dismiss', result.current.items[0]));
    expect(store.connection.sendMessagePromise).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
      await promise!;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toContain('Could not save');
  });
});

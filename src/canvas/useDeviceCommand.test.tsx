// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHaFixture, deferred } from './testing/haFixture';
import { useDeviceCommand } from './useDeviceCommand';
const ref = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: { getState: () => ref.current!.getState(), subscribe: (listener: () => void) => ref.current!.subscribe(listener) },
}));
const intent = { domain: 'light', service: 'turn_on', targets: ['light.gym'] };
beforeEach(() => {
  vi.useFakeTimers();
  ref.current = createHaFixture();
  ref.current.publish('light.gym', 'off');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('deduplicates taps and exposes pending then accepted', async () => {
  const ack = deferred();
  ref.current!.respondWith(() => ack.promise);
  const { result } = renderHook(useDeviceCommand);
  let first!: ReturnType<typeof result.current.send>;
  let second!: typeof first;
  act(() => {
    first = result.current.send(intent);
    second = result.current.send(intent);
  });
  expect(first).toBe(second);
  expect(ref.current!.calls).toHaveLength(1);
  expect(result.current.pending).toBe(true);
  await act(async () => {
    ack.resolve({});
    await first;
  });
  expect(result.current.pending).toBe(false);
  expect(result.current.result?.results[0].phase).toBe('accepted');
});
it('does not let old completion overwrite the latest request', async () => {
  const old = deferred();
  ref.current!.respondWith(() => old.promise);
  const { result } = renderHook(useDeviceCommand);
  let first!: ReturnType<typeof result.current.send>;
  act(() => {
    first = result.current.send(intent);
  });
  ref.current!.respondWith(() => Promise.resolve({}));
  await act(async () => {
    await result.current.send({ ...intent, service: 'turn_off' });
  });
  const latest = result.current.result;
  expect(result.current.pending).toBe(true);
  await act(async () => {
    old.reject(new Error('Old failure'));
    await first;
  });
  expect(result.current.result).toBe(latest);
  expect(result.current.pending).toBe(false);
});
it('unmount cancels work without replay or leaked listeners', async () => {
  const ack = deferred();
  ref.current!.respondWith(() => ack.promise);
  const hook = renderHook(useDeviceCommand);
  let request!: ReturnType<typeof hook.result.current.send>;
  act(() => {
    request = hook.result.current.send(intent);
  });
  hook.unmount();
  expect((await request).results[0].phase).toBe('unconfirmed');
  expect(ref.current!.listenerCount).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  ack.resolve({});
  expect(ref.current!.calls).toHaveLength(1);
});

it('dispatches On-Off-On anew and displays the final On outcome while the first On is outstanding', async () => {
  const hook = renderHook(useDeviceCommand);
  let first!: ReturnType<typeof hook.result.current.send>;
  act(() => {
    first = hook.result.current.send(intent, () => false);
  });
  await act(async () => {
    await hook.result.current.send({ ...intent, service: 'turn_off' });
  });
  const finalAck = deferred();
  ref.current!.respondWith(() => finalAck.promise);
  let final!: typeof first;
  act(() => {
    final = hook.result.current.send(intent);
  });
  expect(final).not.toBe(first);
  expect(ref.current!.calls).toHaveLength(3);
  expect(hook.result.current.result?.results[0].phase).toBe('pending');
  await act(async () => {
    finalAck.reject(new Error('Final On denied'));
    await final;
  });
  expect(hook.result.current.result?.results[0].message).toContain('Final On denied');
  expect(hook.result.current.pending).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
    await first;
  });
  expect(hook.result.current.result?.results[0].message).toContain('Final On denied');
  expect(hook.result.current.pending).toBe(false);
});

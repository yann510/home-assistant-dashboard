import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureIntent, executeCommand, intentKey } from './commands';
import { createHaFixture, deferred } from './testing/haFixture';

let fixture: ReturnType<typeof createHaFixture>;
const intent = { domain: 'light', service: 'turn_on', targets: ['light.gym'] };
beforeEach(() => {
  vi.useFakeTimers();
  fixture = createHaFixture();
  fixture.publish('light.gym', 'off');
});
afterEach(() => vi.useRealTimers());
const run = (observe?: (id: string) => boolean, signal?: AbortSignal) => executeCommand(intent, fixture, observe, signal);
it('captures nested data and stable keys without mutating the caller', () => {
  const input = { ...intent, targets: ['light.gym'], data: { rgb_color: [1, 2, 3] } };
  const captured = captureIntent(input);
  input.targets.push('light.other');
  input.data.rgb_color[0] = 99;
  expect(captured.targets).toEqual(['light.gym']);
  expect(captured.data).toEqual({ rgb_color: [1, 2, 3] });
  expect(intentKey({ ...intent, data: { a: 1, b: 2 } })).toBe(intentKey({ ...intent, data: { b: 2, a: 1 } }));
});
it('reports acceptance without claiming observed state', async () => {
  expect((await run()).results).toEqual([{ target: 'light.gym', phase: 'accepted' }]);
  expect(fixture.listenerCount).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
it('surfaces service rejection and missing entities per target', async () => {
  fixture.respondWith(() => Promise.reject(new Error('Denied')));
  const result = await executeCommand({ ...intent, targets: ['light.gym', 'light.missing'] }, fixture);
  expect(result.results.map(r => r.phase)).toEqual(['failed', 'failed']);
  expect(result.results[0].message).toContain('Denied');
  expect(fixture.calls).toHaveLength(1);
});
it('reports partial success independently', async () => {
  fixture.publish('light.office', 'off');
  fixture.respondWith(message => (JSON.stringify(message).includes('office') ? Promise.reject(new Error('Offline')) : Promise.resolve({})));
  expect((await executeCommand({ ...intent, targets: ['light.gym', 'light.office'] }, fixture)).results.map(r => r.phase)).toEqual([
    'accepted',
    'failed',
  ]);
});
it('bounds acknowledgement and ignores a late response', async () => {
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  const request = run();
  await vi.advanceTimersByTimeAsync(15000);
  expect((await request).results[0].phase).toBe('unconfirmed');
  ack.resolve({});
  expect(fixture.listenerCount).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
it('bounds observation separately after acceptance', async () => {
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  const request = run(id => fixture.getState().entities[id].state === 'on');
  await vi.advanceTimersByTimeAsync(14000);
  ack.resolve({});
  await vi.advanceTimersByTimeAsync(14999);
  expect(fixture.listenerCount).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect((await request).results).toEqual([{ target: 'light.gym', phase: 'unconfirmed', message: expect.any(String) }]);
});
it('reconciles an update before acknowledgement only after acceptance', async () => {
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  const request = run(id => fixture.getState().entities[id].state === 'on');
  fixture.publish('light.gym', 'on');
  ack.resolve({});
  expect((await request).results[0].phase).toBe('observed');
  expect(fixture.listenerCount).toBe(0);
});
it('observes subsequent reported state', async () => {
  const request = run(id => fixture.getState().entities[id].state === 'on');
  await Promise.resolve();
  fixture.publish('light.gym', 'on');
  expect((await request).results[0].phase).toBe('observed');
});
it('ends the old epoch on disconnect and never replays on reconnect', async () => {
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  const old = run();
  fixture.disconnect();
  fixture.reconnect();
  fixture.respondWith(() => Promise.resolve({}));
  const fresh = run(() => false);
  ack.resolve({});
  await vi.advanceTimersByTimeAsync(15000);
  expect((await old).results[0].phase).toBe('unconfirmed');
  expect((await fresh).results).toEqual([{ target: 'light.gym', phase: 'unconfirmed', message: expect.any(String) }]);
  expect(fixture.calls).toHaveLength(2);
});
it('fails offline without dispatch and cancels subscriptions/timers', async () => {
  fixture.disconnect();
  expect((await run()).results[0].phase).toBe('failed');
  expect(fixture.calls).toHaveLength(0);
  fixture.reconnect();
  const controller = new AbortController();
  const request = run(() => false, controller.signal);
  controller.abort();
  expect((await request).results[0].phase).toBe('unconfirmed');
  expect(fixture.listenerCount).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
it('requires explicit targetless correlation and never sends the room as an entity', async () => {
  expect(() => captureIntent({ ...intent, targets: [] })).toThrow(/target/i);
  const result = await executeCommand(
    {
      domain: 'google_assistant_sdk',
      service: 'send_text_command',
      targets: [],
      resultTarget: 'living',
      data: { command: 'Open living blinds' },
    },
    fixture
  );
  expect(result.results).toEqual([{ target: 'living', phase: 'accepted' }]);
  expect(fixture.calls[0]).not.toHaveProperty('target');
});

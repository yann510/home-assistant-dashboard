// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasLightDetails } from './CanvasLightDetails';
import { CanvasAllLights } from './CanvasLights';
import { CanvasLightsProvider } from './useCanvasLights';
import { createHaFixture, deferred } from './testing/haFixture';

const fixtureRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign(
    (select: (state: unknown) => unknown) => fixtureRef.current!.useStore(select),
    {
      getState: () => fixtureRef.current!.getState(),
      subscribe: (listener: () => void) => fixtureRef.current!.subscribe(listener),
    }
  ),
}));

const gym = 'light.gym';
const living = 'light.light_living_room_bulbs';
const expected = (entityId: string, service: 'turn_on' | 'turn_off', data: Record<string, unknown> = {}) => ({
  type: 'call_service',
  domain: 'light',
  service,
  target: { entity_id: [entityId] },
  service_data: data,
});

function renderGym() {
  render(<CanvasLightsProvider><CanvasLightDetails entityId={gym} /></CanvasLightsProvider>);
}

beforeEach(() => { fixtureRef.current = createHaFixture(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('distinguishes state before ACK, ACK before state, and no state confirmation', async () => {
  vi.useFakeTimers();
  const fixture = fixtureRef.current!;
  fixture.publish(gym, 'off');
  const first = deferred();
  const second = deferred();
  const third = deferred();
  const late = deferred();
  fixture.respondInOrder(first.promise, second.promise, third.promise, late.promise);
  renderGym();

  fireEvent.click(screen.getByRole('button', { name: 'Turn on Gym' }));
  expect(fixture.calls).toEqual([expected(gym, 'turn_on')]);
  expect(screen.getByRole('status').textContent).toBe('Sending command…');
  await act(async () => fixture.publish(gym, 'on'));
  expect(screen.getByRole('status').textContent).toBe('Sending command…');
  await act(async () => first.resolve({}));
  expect(screen.getByRole('status').textContent).toBe('Reported state updated.');
  expect(screen.getByRole('button', { name: 'Turn off Gym' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Turn off Gym' }));
  expect(fixture.calls).toEqual([expected(gym, 'turn_on'), expected(gym, 'turn_off')]);
  await act(async () => second.resolve({}));
  expect(screen.getByRole('status').textContent).toBe('Service accepted; waiting for reported state.');
  expect(screen.getByRole('button', { name: 'Turn off Gym' })).toBeTruthy();
  await act(async () => fixture.publish(gym, 'off'));
  expect(screen.getByRole('status').textContent).toBe('Reported state updated.');

  fireEvent.click(screen.getByRole('button', { name: 'Turn on Gym' }));
  expect(fixture.calls).toEqual([expected(gym, 'turn_on'), expected(gym, 'turn_off'), expected(gym, 'turn_on')]);
  await act(async () => third.resolve({}));
  expect(screen.getByRole('status').textContent).toBe('Service accepted; waiting for reported state.');
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole('alert').textContent).toContain('requested device state was not reported');
  expect(screen.getByRole('button', { name: 'Turn on Gym' })).toBeTruthy();
  expect(fixture.getState().entities[gym].state).toBe('off');
  expect(fixture.calls).toHaveLength(3);

  fireEvent.click(screen.getByRole('button', { name: 'Turn on Gym' }));
  expect(fixture.calls).toEqual([
    expected(gym, 'turn_on'), expected(gym, 'turn_off'), expected(gym, 'turn_on'), expected(gym, 'turn_on'),
  ]);
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole('alert').textContent).toContain('No service acknowledgement');
  await act(async () => late.resolve({}));
  expect(screen.getByRole('alert').textContent).toContain('No service acknowledgement');
  expect(fixture.getState().entities[gym].state).toBe('off');
  expect(fixture.calls).toHaveLength(4);
});

it('keeps rejected service visible and does not infer a state change', async () => {
  const fixture = fixtureRef.current!;
  fixture.publish(gym, 'off');
  const reply = deferred();
  fixture.respondWith(() => reply.promise);
  renderGym();
  fireEvent.click(screen.getByRole('button', { name: 'Turn on Gym' }));
  expect(fixture.calls).toEqual([expected(gym, 'turn_on')]);
  await act(async () => reply.reject(new Error('Permission denied')));
  expect(screen.getByRole('alert').textContent).toContain('Permission denied');
  expect(screen.getByRole('button', { name: 'Turn on Gym' })).toBeTruthy();
  expect(fixture.getState().entities[gym].state).toBe('off');
  expect(fixture.calls).toHaveLength(1);
});

it('records partial all-light success and the exact failed target', async () => {
  const fixture = fixtureRef.current!;
  fixture.publish(living, 'on', { friendly_name: 'Living bulbs' });
  fixture.publish(gym, 'on', { friendly_name: 'Gym' });
  const livingReply = deferred();
  const gymReply = deferred();
  fixture.respondWith(message => ((message as { target: { entity_id: string[] } }).target.entity_id[0] === living
    ? livingReply.promise : gymReply.promise));
  render(<CanvasLightsProvider><CanvasAllLights onOpenLight={() => {}} /></CanvasLightsProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Turn off all lights' }));
  expect(fixture.calls).toEqual([expected(living, 'turn_off'), expected(gym, 'turn_off')]);
  expect(screen.getByRole('status').textContent).toContain('Sending to 2 lights');
  await act(async () => {
    fixture.publish(living, 'off', { friendly_name: 'Living bulbs' });
    livingReply.resolve({});
    gymReply.reject(new Error('Gym unavailable'));
  });
  expect(screen.getByRole('alert').textContent).toContain('Gym: Gym unavailable');
  expect(screen.getByRole('status').textContent).toContain('1 light reported the requested state');
  expect(fixture.getState().entities[living].state).toBe('off');
  expect(fixture.getState().entities[gym].state).toBe('on');
  expect(fixture.calls).toHaveLength(2);
});

it('blocks writes while disconnected and ignores a late ACK after a replacement connection', async () => {
  const fixture = fixtureRef.current!;
  fixture.publish(gym, 'off');
  const reply = deferred();
  fixture.respondWith(() => reply.promise);
  fixture.disconnect();
  renderGym();
  expect((screen.getByRole('button', { name: 'Turn on Gym' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Turn on Gym' }));
  expect(fixture.calls).toEqual([]);
  act(() => fixture.reconnect());
  fireEvent.click(screen.getByRole('button', { name: 'Turn on Gym' }));
  expect(fixture.calls).toEqual([expected(gym, 'turn_on')]);
  act(() => fixture.disconnect());
  expect(screen.getByRole('alert').textContent).toContain('Connection changed while waiting');
  act(() => fixture.reconnect());
  await act(async () => reply.resolve({}));
  expect(screen.getByRole('alert').textContent).toContain('Connection changed while waiting');
  expect(fixture.getState().entities[gym].state).toBe('off');
  expect(fixture.calls).toEqual([expected(gym, 'turn_on')]);
});

it('invalidates an in-flight command on a same-socket reconnect without replaying it', async () => {
  const fixture = fixtureRef.current!;
  fixture.publish(gym, 'off');
  const socket = fixture.connection;
  const reply = deferred();
  fixture.respondWith(() => reply.promise);
  renderGym();
  fireEvent.click(screen.getByRole('button', { name: 'Turn on Gym' }));
  expect(fixture.calls).toEqual([expected(gym, 'turn_on')]);
  act(() => fixture.socketDisconnect());
  expect(screen.getByRole('alert').textContent).toContain('Connection changed while waiting');
  act(() => fixture.socketReconnect());
  expect(fixture.connection).toBe(socket);
  await act(async () => reply.resolve({}));
  expect(screen.getByRole('alert').textContent).toContain('Connection changed while waiting');
  expect(fixture.getState().entities[gym].state).toBe('off');
  expect(fixture.calls).toEqual([expected(gym, 'turn_on')]);
});

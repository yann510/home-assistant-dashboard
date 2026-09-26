// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasBlinds } from './CanvasBlinds';
import { createHaFixture, deferred } from './testing/haFixture';

const fixtureRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign((select: (state: unknown) => unknown) => fixtureRef.current!.useStore(select), {
    getState: () => fixtureRef.current!.getState(),
    subscribe: (listener: () => void) => fixtureRef.current!.subscribe(listener),
  }),
}));
let fixture: ReturnType<typeof createHaFixture>;
beforeEach(() => { fixture = createHaFixture(); fixtureRef.current = fixture; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const command = (index: number) => fixture.calls[index] as { type: string; domain: string; service: string; service_data: { command: string }; target?: unknown };
const choose = async (room: string) => userEvent.click(screen.getByRole('button', { name: `${room} blinds` }));

it('has independent room selection and disables commands when empty', async () => {
  render(<CanvasBlinds />);
  for (const room of ['Living room', 'Bedroom', 'Gym']) await choose(room);
  for (const action of ['Open', 'Stop', 'Close']) expect(screen.getByRole('button', { name: `${action} selected blinds` }).hasAttribute('disabled')).toBe(true);
  expect(fixture.calls).toHaveLength(0);
});

it('sends a captured two-room selection without fake entity targets', async () => {
  render(<CanvasBlinds />);
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(fixture.calls.map((_, i) => command(i).service_data.command)).toEqual([
    'open all the blinds living room', 'open all the blinds bedroom',
  ]);
  for (let index = 0; index < 2; index++) {
    expect(command(index).type).toBe('call_service');
    expect(command(index).domain).toBe('google_assistant_sdk');
    expect(command(index).service).toBe('send_text_command');
    expect(command(index).target).toBeUndefined();
  }
  expect(screen.getAllByText(/Command sent · position unavailable/)).toHaveLength(2);
});

it('keeps room targets captured while selection changes during a pending request', async () => {
  const first = deferred();
  const second = deferred();
  fixture.respondWith(message => String((message as { service_data: { command: string } }).service_data.command).includes('living room') ? first.promise : second.promise);
  render(<CanvasBlinds />);
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Close selected blinds' }));
  await choose('Living room');
  await choose('Gym');
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(fixture.calls.map((_, i) => command(i).service_data.command)).toEqual([
    'close all the blinds living room', 'close all the blinds bedroom',
  ]);
  await act(async () => first.resolve({}));
  expect(screen.getByText('Living room · Command sent · position unavailable')).toBeTruthy();
  expect(screen.getByText('Bedroom · Sending command…')).toBeTruthy();
  await act(async () => second.resolve({}));
  expect(screen.getByText('Living room · Command sent · position unavailable')).toBeTruthy();
  expect(screen.getByText('Bedroom · Command sent · position unavailable')).toBeTruthy();
});

it('reports a partial failure and retries only its immutable failed room', async () => {
  fixture.respondWith(message => String((message as { service_data: { command: string } }).service_data.command).includes('bedroom') ? Promise.reject(new Error('Assistant unavailable')) : Promise.resolve({}));
  render(<CanvasBlinds />);
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry Open for failed rooms' })).toBeTruthy());
  const feedback = screen.getByRole('group', { name: 'Open blind command results' });
  expect(within(feedback).getByText('Living room · Command sent · position unavailable')).toBeTruthy();
  expect(within(feedback).getByText(/Bedroom · Assistant unavailable/)).toBeTruthy();
  await choose('Bedroom');
  const retry = deferred();
  fixture.respondWith(() => retry.promise);
  await userEvent.click(screen.getByRole('button', { name: 'Retry Open for failed rooms' }));
  await waitFor(() => expect(fixture.calls).toHaveLength(3));
  expect(command(2).service_data.command).toBe('open all the blinds bedroom');
  const retryFeedback = screen.getByRole('group', { name: 'Open blind command results' });
  expect(within(retryFeedback).getByText('Living room · Command sent · position unavailable')).toBeTruthy();
  expect(within(retryFeedback).getByText('Bedroom · Sending command…')).toBeTruthy();
  await act(async () => retry.resolve({}));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry Open for failed rooms' })).toBeNull());
  const finalFeedback = screen.getByRole('group', { name: 'Open blind command results' });
  expect(within(finalFeedback).getByText('Living room · Command sent · position unavailable')).toBeTruthy();
  expect(within(finalFeedback).getByText('Bedroom · Command sent · position unavailable')).toBeTruthy();
});

it('does not dispatch while disconnected and describes the failure', async () => {
  act(() => fixture.disconnect());
  render(<CanvasBlinds />);
  expect(screen.getByRole('button', { name: 'Open selected blinds' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/Home Assistant is disconnected/)).toBeTruthy();
  expect(fixture.calls).toHaveLength(0);
});

it('keeps Stop available while Open waits and sends an independent Stop command', async () => {
  const opening = deferred();
  fixture.respondWith(message => String((message as { service_data: { command: string } }).service_data.command).startsWith('open') ? opening.promise : Promise.resolve({}));
  render(<CanvasBlinds />);
  await choose('Bedroom');
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  expect(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room' }).hasAttribute('disabled')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room' }));
  expect(fixture.calls).toHaveLength(2);
  await act(async () => opening.resolve({}));
  expect(fixture.calls).toHaveLength(2);
  expect(command(1).service_data.command).toBe('stop all the blinds living room');
});

it('stops the originally commanded rooms after the selection changes', async () => {
  const movement = deferred();
  fixture.respondWith(message => String((message as { service_data: { command: string } }).service_data.command).startsWith('close') ? movement.promise : Promise.resolve({}));
  render(<CanvasBlinds />);
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Close selected blinds' }));
  await choose('Living room');
  await choose('Gym');
  expect(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room, Bedroom' }).hasAttribute('disabled')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room, Bedroom' }));
  expect(fixture.calls).toHaveLength(4);
  await act(async () => movement.resolve({}));
  expect(fixture.calls).toHaveLength(4);
  expect(fixture.calls.slice(2).map((_, index) => command(index + 2).service_data.command)).toEqual([
    'stop all the blinds living room', 'stop all the blinds bedroom',
  ]);
});

it('keeps Stop available for moving rooms after the selection is cleared', async () => {
  const movement = deferred();
  fixture.respondWith(message => String((message as { service_data: { command: string } }).service_data.command).startsWith('open') ? movement.promise : Promise.resolve({}));
  render(<CanvasBlinds />);
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  await choose('Living room');
  await choose('Bedroom');
  expect(screen.getByRole('button', { name: 'Open selected blinds' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room, Bedroom' }).hasAttribute('disabled')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room, Bedroom' }));
  expect(fixture.calls).toHaveLength(4);
  await act(async () => movement.resolve({}));
  expect(fixture.calls).toHaveLength(4);
  expect(fixture.calls.slice(2).map((_, index) => command(index + 2).service_data.command)).toEqual([
    'stop all the blinds living room', 'stop all the blinds bedroom',
  ]);
});

it('retains acknowledged movement targets for Stop after selection is cleared', async () => {
  render(<CanvasBlinds />);
  await choose('Gym');
  await userEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  await waitFor(() => expect(screen.getAllByText(/Command sent · position unavailable/)).toHaveLength(2));
  await choose('Living room');
  await choose('Bedroom');
  const stop = screen.getByRole('button', { name: 'Stop recently requested blinds in Living room, Bedroom' });
  expect(stop.hasAttribute('disabled')).toBe(false);
  await userEvent.click(stop);
  await waitFor(() => expect(fixture.calls).toHaveLength(4));
  expect(fixture.calls.slice(2).map((_, index) => command(index + 2).service_data.command)).toEqual([
    'stop all the blinds living room', 'stop all the blinds bedroom',
  ]);
});

it('sends Stop immediately and preserves its feedback after a late Open ACK beyond timeout', async () => {
  vi.useFakeTimers();
  const opening = deferred();
  fixture.respondInOrder(opening.promise, Promise.resolve({}));
  render(<CanvasBlinds initialRoom='living room' />);
  fireEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room' }));
  expect(fixture.calls.map((_, i) => command(i).service_data.command)).toEqual([
    'open all the blinds living room', 'stop all the blinds living room',
  ]);
  await act(async () => {});
  const stopFeedback = screen.getByRole('group', { name: 'Stop blind command results' });
  expect(stopFeedback.textContent).toContain('Command sent · position unavailable');
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole('group', { name: 'Open blind command results' }).textContent).toContain('No service acknowledgement');
  await act(async () => opening.resolve({}));
  expect(stopFeedback.textContent).toContain('Command sent · position unavailable');
  expect(fixture.calls).toHaveLength(2);
});

it.each(['replacement', 'same socket'])('never replays Open or Stop after a synchronous %s reconnect', async kind => {
  const opening = deferred();
  const stopping = deferred();
  fixture.respondInOrder(opening.promise, stopping.promise);
  render(<CanvasBlinds initialRoom='living room' />);
  fireEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room' }));
  expect(fixture.calls).toHaveLength(2);
  await act(async () => {
    if (kind === 'replacement') { fixture.disconnect(); fixture.reconnect(); }
    else { fixture.socketDisconnect(); fixture.socketReconnect(); }
  });
  const stopFeedback = screen.getByRole('group', { name: 'Stop blind command results' });
  expect(stopFeedback.textContent).toContain('Connection changed while waiting');
  await act(async () => { opening.resolve({}); stopping.resolve({}); });
  expect(stopFeedback.textContent).toContain('Connection changed while waiting');
  expect(fixture.calls.map((_, i) => command(i).service_data.command)).toEqual([
    'open all the blinds living room', 'stop all the blinds living room',
  ]);
});

it('blocks movement and movement Retry while Stop is pending', async () => {
  const opening = deferred();
  const stopping = deferred();
  fixture.respondInOrder(opening.promise, stopping.promise, Promise.resolve({}));
  render(<CanvasBlinds initialRoom='living room' />);
  fireEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  await act(async () => opening.reject(new Error('Assistant unavailable')));
  const retry = screen.getByRole('button', { name: 'Retry Open for failed rooms' });
  fireEvent.click(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room' }));
  for (const button of [retry, screen.getByRole('button', { name: 'Open selected blinds' }), screen.getByRole('button', { name: 'Close selected blinds' })]) {
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
  }
  expect(fixture.calls).toHaveLength(2);
  await act(async () => stopping.resolve({}));
  fireEvent.click(screen.getByRole('button', { name: 'Close selected blinds' }));
  expect(fixture.calls.map((_, i) => command(i).service_data.command)).toEqual([
    'open all the blinds living room', 'stop all the blinds living room', 'close all the blinds living room',
  ]);
  await act(async () => {});
});

it('replaces recent targets with the latest movement request and expires them 90 seconds after dispatch', async () => {
  vi.useFakeTimers();
  render(<CanvasBlinds initialRoom='living room' />);
  fireEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  await act(async () => {});
  await act(async () => vi.advanceTimersByTime(30_000));
  fireEvent.click(screen.getByRole('button', { name: 'Living room blinds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Bedroom blinds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close selected blinds' }));
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Bedroom blinds' }));
  expect(screen.getByRole('button', { name: 'Stop recently requested blinds in Bedroom' }).hasAttribute('disabled')).toBe(false);
  await act(async () => vi.advanceTimersByTime(60_000));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recently requested blinds in Bedroom' }));
  await act(async () => {});
  expect(fixture.calls.map((_, i) => command(i).service_data.command)).toEqual([
    'open all the blinds living room', 'close all the blinds bedroom', 'stop all the blinds bedroom',
  ]);
  await act(async () => vi.advanceTimersByTime(29_999));
  expect(screen.getByRole('button', { name: 'Stop recently requested blinds in Bedroom' }).hasAttribute('disabled')).toBe(false);
  await act(async () => vi.advanceTimersByTime(1));
  expect(screen.getByRole('button', { name: 'Stop selected blinds' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText(/Stop targets/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Gym blinds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop selected blinds' }));
  await act(async () => {});
  expect(command(3).service_data.command).toBe('stop all the blinds gym');
});

it('does not send anything later when unmounted with Open and Stop outstanding', async () => {
  const opening = deferred();
  const stopping = deferred();
  fixture.respondInOrder(opening.promise, stopping.promise);
  const view = render(<CanvasBlinds initialRoom='living room' />);
  fireEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recently requested blinds in Living room' }));
  expect(fixture.calls).toHaveLength(2);
  view.unmount();
  await act(async () => { opening.resolve({}); stopping.resolve({}); });
  expect(fixture.calls).toHaveLength(2);
  expect(fixture.listenerCount).toBe(0);
  expect(fixture.socketListenerCount).toBe(0);
});

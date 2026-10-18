// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';
import { CanvasTrackHeart } from './CanvasTrackHeart';
const A = 'spotify:track:0000000000000000000001';
const B = 'spotify:track:0000000000000000000002';
const send = vi.fn();
const animate = vi.fn();
beforeEach(() => {
  send.mockReset().mockImplementation(async message => ({ track_uri: message.track_uri, saved: message.saved ?? false }));
  useStore.setState({ connectionStatus: 'connected', connection: { connected: true, sendMessagePromise: send } as unknown as Connection });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  animate.mockReset().mockReturnValue({ cancel() {}, finished: new Promise(() => {}) });
  Element.prototype.animate = animate;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('exposes unknown/loading then confirmed pressed state and animates only successful user writes, keeping keyboard focus', async () => {
  const { unmount } = render(<CanvasTrackHeart trackUri={A} title='Song A' enabled />);
  expect(screen.getByRole('button').hasAttribute('aria-pressed')).toBe(false);
  const heart = await screen.findByRole('button', { name: 'Save Song A to Liked Songs' });
  expect(heart.getAttribute('aria-pressed')).toBe('false');
  expect(animate).not.toHaveBeenCalled();
  heart.focus();
  fireEvent.click(heart);
  await screen.findByRole('button', { name: 'Remove Song A from Liked Songs' });
  expect(heart.getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(heart);
  expect(animate).toHaveBeenCalled();
  const effect = animate.mock.results[0].value;
  const cancel = vi.spyOn(effect, 'cancel');
  unmount();
  expect(cancel).toHaveBeenCalled();
  expect(
    send.mock.calls.every(([message]) => ['dashboard_music/track_saved', 'dashboard_music/set_track_saved'].includes(message.type))
  ).toBe(true);
});
it('never animates failed writes or late confirmation for another track and provides a read-only retry', async () => {
  const { rerender } = render(<CanvasTrackHeart trackUri={A} title='Song A' enabled />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save Song A to Liked Songs' }));
  await screen.findByRole('button', { name: 'Remove Song A from Liked Songs' });
  animate.mockClear();
  send.mockRejectedValueOnce(new Error('Try again'));
  fireEvent.click(screen.getByRole('button'));
  await screen.findByRole('button', { name: 'Retry song saved state' });
  expect(animate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button'));
  await screen.findByRole('button', { name: 'Save Song A to Liked Songs' });
  let finish!: (value: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole('button'));
  rerender(<CanvasTrackHeart trackUri={B} title='Song B' enabled />);
  await screen.findByRole('button', { name: 'Save Song B to Liked Songs' });
  await act(async () => finish({ track_uri: A, saved: true }));
  expect(animate).not.toHaveBeenCalled();
});
it('keeps a successful saved state when animation throws and disables unsupported current tracks without claiming unsaved', async () => {
  animate.mockImplementation(() => {
    throw new Error('No animation');
  });
  const { rerender } = render(<CanvasTrackHeart trackUri={A} title='Song A' enabled />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save Song A to Liked Songs' }));
  await waitFor(() => expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true'));
  rerender(<CanvasTrackHeart title='TV' enabled={false} />);
  const button = screen.getByRole('button');
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(button.hasAttribute('aria-pressed')).toBe(false);
});
it('updates a saved song immediately under reduced motion and never decorates an external read', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  send.mockResolvedValueOnce({ track_uri: A, saved: true });
  render(<CanvasTrackHeart trackUri={A} title='Song A' enabled />);
  const heart = await screen.findByRole('button', { name: 'Remove Song A from Liked Songs' });
  expect(animate).not.toHaveBeenCalled();
  fireEvent.click(heart);
  await screen.findByRole('button', { name: 'Save Song A to Liked Songs' });
  expect(animate).not.toHaveBeenCalled();
});

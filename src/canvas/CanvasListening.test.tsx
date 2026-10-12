// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasQueue, ListeningControls, MusicItemActions } from './CanvasListening';
const music = vi.hoisted(() => ({
  attributes: { shuffle: false, repeat: 'off' },
  disabled: false,
  playback: { busy: false },
  favouritePlayback: { pending: null },
  session: { entityId: 'room', connected: true },
  listening: {
    canQueue: true,
    canEnqueue: true,
    canShuffle: true,
    canRepeat: true,
    busy: false,
    loading: false,
    loaded: false,
    items: [] as { title: string }[],
    queueError: '',
    mutationError: '',
    mutationStatus: '',
    refresh: vi.fn(),
    retryDiscovery: vi.fn(),
    enqueue: vi.fn(),
    shuffle: vi.fn(),
    repeat: vi.fn(),
  },
}));
vi.mock('./CanvasMusicProvider', () => ({ useCanvasMusic: () => music }));
afterEach(() => {
  cleanup();
  music.attributes = { shuffle: false, repeat: 'off' };
  music.listening.queueError = '';
  music.listening.loaded = false;
  music.listening.items = [];
  music.listening.busy = false;
  vi.clearAllMocks();
});
it('renders confirmed mode attributes and sends next modes without optimistic selection', () => {
  const { rerender } = render(<ListeningControls onOpenQueue={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
  expect(music.listening.shuffle).toHaveBeenCalledWith(true);
  expect(screen.getByRole('button', { name: 'Shuffle' }).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Repeat: off' }));
  expect(music.listening.repeat).toHaveBeenCalledWith('all');
  music.attributes = { shuffle: true, repeat: 'all' };
  rerender(<ListeningControls onOpenQueue={() => {}} />);
  expect(screen.getByRole('button', { name: 'Shuffle' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Repeat: all' }));
  expect(music.listening.repeat).toHaveBeenLastCalledWith('one');
  music.attributes.repeat = 'one';
  rerender(<ListeningControls onOpenQueue={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Repeat: one' }));
  expect(music.listening.repeat).toHaveBeenLastCalledWith('off');
  music.listening.busy = true;
  rerender(<ListeningControls onOpenQueue={() => {}} />);
  expect((screen.getByRole('button', { name: 'Shuffle' }) as HTMLButtonElement).disabled).toBe(true);
});
it('distinguishes unknown, failed and authoritative empty queue states and shows actual entries', () => {
  const { rerender } = render(<CanvasQueue />);
  expect(screen.queryByText('The speaker queue is empty.')).toBeNull();
  music.listening.queueError = 'Read failed';
  rerender(<CanvasQueue />);
  expect(screen.getByRole('alert').textContent).toBe('Read failed');
  music.listening.queueError = '';
  music.listening.loaded = true;
  rerender(<CanvasQueue />);
  expect(screen.getByText('The speaker queue is empty.')).toBeTruthy();
  music.listening.items = [{ title: 'Actual queued song' }];
  rerender(<CanvasQueue />);
  expect(screen.getByText('1 entry')).toBeTruthy();
  expect(screen.getByText('Actual queued song')).toBeTruthy();
});
it('offers accessible Spotify queue actions, Escape returns focus, and favourites have no enqueue menu', () => {
  const item = { title: 'Song', can_play: true, media_content_type: 'music', media_content_id: 'spotify:track:1234567890123456789012' };
  const { rerender } = render(<MusicItemActions item={item} />);
  const trigger = screen.getByRole('button', { name: 'Actions for Song' });
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Play next' }), { key: 'Escape' });
  expect(document.activeElement).toBe(trigger);
  expect(screen.queryByRole('button', { name: 'Play next' })).toBeNull();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }));
  expect(music.listening.enqueue).toHaveBeenCalledWith(item, 'add');
  rerender(<MusicItemActions item={{ ...item, media_content_id: 'favorite:1' }} />);
  expect(screen.queryByRole('button', { name: 'Actions for Song' })).toBeNull();
});

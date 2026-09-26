// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HassContext, useStore, type HassContextProps } from '@hakit/core';
import type { Connection, HassEntities } from 'home-assistant-js-websocket';
import { CanvasMusicProvider, useCanvasMusic } from './CanvasMusicProvider';
import { CanvasMusic } from './CanvasMusic';
import { CanvasPlayer } from './CanvasPlayer';
import { CanvasSpeakers } from './CanvasSpeakers';
import { useState } from 'react';

const sendMessagePromise = vi.fn();
const legacyCallService = vi.fn();
const browseMedia = vi.fn();
const context = {
  useStore,
  getAllEntities: () => useStore.getState().entities,
  joinHassUrl: (path: string) => `http://homeassistant.test${path}`,
  callService: legacyCallService,
  getConfig: async () => null,
} as unknown as HassContextProps;

function speaker(room: string, state = 'playing', group = ['living_room', 'gym']) {
  return {
    entity_id: `media_player.${room}`,
    state,
    last_changed: '2026-09-07T20:00:00Z',
    last_updated: '2026-09-07T20:00:00Z',
    context: { id: 'speaker-test', parent_id: null, user_id: null },
    attributes: {
      friendly_name: room === 'living_room' ? 'Living Room' : room === 'gym' ? 'Gym' : room,
      group_members: group.map(id => `media_player.${id}`),
      supported_features: 4127295,
      volume_level: 0.34,
      is_volume_muted: false,
      media_title: 'Test track',
      media_artist: 'Test artist',
      media_duration: 200,
      media_position: 40,
    },
  };
}

function updateEntity(id: string, patch: Partial<ReturnType<typeof speaker>>, attributes: Record<string, unknown> = {}) {
  act(() => {
    const entities = useStore.getState().entities;
    const old = entities[id];
    useStore.setState({ entities: { ...entities, [id]: { ...old, ...patch, attributes: { ...old.attributes, ...attributes } } } });
  });
}

function CleanupProbe() {
  const { session } = useCanvasMusic();
  return <button onClick={() => void session.updateFollowing('disable')}>Request cleanup directly</button>;
}
function Surface() {
  const [panel, setPanel] = useState('overview');
  return (
    <CanvasMusicProvider>
      <CleanupProbe />
      <button onClick={() => setPanel('overview')}>Close detail</button>
      {panel === 'overview' ? (
        <CanvasMusic onOpenPlayer={() => setPanel('player')} onOpenSpeakers={() => setPanel('speakers')} />
      ) : panel === 'player' ? (
        <CanvasPlayer onClose={() => setPanel('overview')} />
      ) : (
        <CanvasSpeakers />
      )}
    </CanvasMusicProvider>
  );
}
function mount() {
  return render(
    <HassContext.Provider value={context}>
      <Surface />
    </HassContext.Provider>
  );
}

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  // Browser popover positioning/light-dismiss are checked in the real preview.
  HTMLElement.prototype.showPopover = function () {
    this.style.display = 'block';
  };
  HTMLElement.prototype.hidePopover = function () {
    this.style.display = 'none';
  };
  // jsdom does not implement the native dialog's top layer and focus behavior.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
    this.querySelector('button')?.focus();
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  sendMessagePromise.mockReset().mockResolvedValue({ context: {} });
  browseMedia.mockReset().mockResolvedValue({ children: [] });
  legacyCallService.mockReset().mockResolvedValue(undefined);
  const entities: HassEntities = Object.fromEntries(
    ['living_room', 'gym', 'bathroom', 'bedroom'].map(room => [
      `media_player.${room}`,
      speaker(
        room,
        ['living_room', 'gym'].includes(room) ? 'playing' : 'idle',
        ['living_room', 'gym'].includes(room) ? ['living_room', 'gym'] : [room]
      ),
    ])
  );
  for (const [id, state] of [
    ['input_boolean.speaker_follow_motion', 'off'],
    ['input_text.speaker_follow_source', ''],
    ['script.speaker_follow_motion', 'off'],
  ]) {
    entities[id] = { ...speaker('helper'), entity_id: id, state, attributes: { friendly_name: id } };
  }
  useStore.setState({
    entities,
    ready: true,
    connectionStatus: 'connected',
    connection: {
      connected: true,
      subscribeMessage: async () => () => {},
      sendMessagePromise: (message: { type: string }) =>
        message.type === 'call_service'
          ? sendMessagePromise(message)
          : message.type === 'media_player/browse_media'
            ? browseMedia(message)
            : Promise.resolve({}),
    } as unknown as Connection,
    globalComponentStyles: {},
    windowContext: window,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Canvas music', () => {
  it.each(Array.from({ length: 15 }, (_, index) => {
    const rooms = ['living_room', 'bathroom', 'bedroom', 'gym'].filter((_, bit) => Boolean((index + 1) & (1 << bit)));
    return [rooms.join(', '), rooms] as const;
  }))('preserves a selected room for the %s subset', async (_label, rooms) => {
    const group = rooms.map(room => `media_player.${room}`);
    for (const room of ['living_room', 'bathroom', 'bedroom', 'gym']) {
      updateEntity(`media_player.${room}`, { state: rooms.includes(room) ? 'playing' : 'idle' }, {
        group_members: rooms.includes(room) ? group : [`media_player.${room}`],
      });
    }
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes.filter(box => box.checked)).toHaveLength(rooms.length);
    const source = rooms[0];
    const sourceBox = screen.getByRole('checkbox', { name: new RegExp(source === 'living_room' ? 'Living Room' : source, 'i') }) as HTMLInputElement;
    if (rooms.length === 1) {
      expect(sourceBox.disabled).toBe(true);
      fireEvent.click(sourceBox);
      expect(sendMessagePromise).not.toHaveBeenCalled();
    } else {
      await userEvent.click(sourceBox);
      expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        service: 'unjoin', target: { entity_id: [`media_player.${source}`] },
      }));
      expect(checkboxes.filter(box => box.checked)).toHaveLength(rooms.length);
    }
  });

  it.each([['bathroom', 'bedroom', 'gym'], ['gym', 'bedroom', 'bathroom']])(
    'waits for all three survivors when their topology reports arrive in %s order', async (...order) => {
      const all = ['living_room', 'bathroom', 'bedroom', 'gym'].map(room => `media_player.${room}`);
      const survivors = all.slice(1);
      for (const id of all) updateEntity(id, { state: 'playing' }, { group_members: all, media_content_id: 'queue-1' });
      mount();
      await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
      await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
      updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
      for (const room of order.slice(0, 2)) {
        updateEntity(`media_player.${room}`, {}, { group_members: survivors });
        expect(sendMessagePromise.mock.calls.map(([message]) => message.service)).toEqual(['unjoin']);
      }
      updateEntity(`media_player.${order[2]}`, {}, { group_members: survivors });
      await act(async () => { await Promise.resolve(); });
      expect(sendMessagePromise.mock.calls.map(([message]) => message.service)).toEqual(['unjoin', 'media_pause']);
      expect(sendMessagePromise).toHaveBeenLastCalledWith(expect.objectContaining({ target: { entity_id: ['media_player.living_room'] } }));
      updateEntity('media_player.living_room', { state: 'paused' });
      await screen.findByText('Rooms updated.');
      expect(screen.queryByRole('alert')).toBeNull();
      expect((screen.getByRole('checkbox', { name: /Living Room/ }) as HTMLInputElement).checked).toBe(false);
      expect(sendMessagePromise.mock.calls.some(([message]) => message.service === 'media_play')).toBe(false);
    }
  );
  it('keeps a paused playlist through transfer and resumes only on the surviving source', async () => {
    for (const id of ['media_player.living_room', 'media_player.gym'])
      updateEntity(id, {}, { media_content_id: 'playlist-1', media_playlist: 'Playlist 1' });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      service: 'media_pause', target: { entity_id: ['media_player.living_room'] },
    }));
    updateEntity('media_player.living_room', { state: 'paused' });
    updateEntity('media_player.gym', { state: 'paused' });
    await userEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    updateEntity('media_player.gym', {}, { group_members: ['media_player.gym'] });
    await screen.findByText('Rooms updated.');
    expect(sendMessagePromise.mock.calls.map(([message]) => message.service)).toEqual(['media_pause', 'unjoin']);
    await userEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(sendMessagePromise.mock.calls.map(([message]) => message.service)).toEqual(['media_pause', 'unjoin', 'media_play']);
    expect(sendMessagePromise).toHaveBeenLastCalledWith(expect.objectContaining({
      target: { entity_id: ['media_player.gym'] },
    }));
  });

  it('reports an unconfirmed three-survivor transfer without pausing or resuming audio', async () => {
    const all = ['living_room', 'bathroom', 'bedroom', 'gym'].map(room => `media_player.${room}`);
    const survivors = all.slice(1);
    for (const id of all) updateEntity(id, { state: 'playing' }, { group_members: all });
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /Living Room/ })); });
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    updateEntity('media_player.bathroom', {}, { group_members: survivors });
    updateEntity('media_player.bedroom', {}, { group_members: survivors });
    await act(async () => { await vi.advanceTimersByTimeAsync(15001); });
    expect(screen.getByRole('alert').textContent).toContain('did not confirm');
    expect(sendMessagePromise.mock.calls.map(([message]) => message.service)).toEqual(['unjoin']);
  });

  it('leaves a four-room group untouched when removing its coordinator is rejected', async () => {
    const all = ['living_room', 'bathroom', 'bedroom', 'gym'].map(room => `media_player.${room}`);
    for (const id of all) updateEntity(id, { state: 'playing' }, { group_members: all });
    sendMessagePromise.mockRejectedValueOnce(new Error('Transfer rejected'));
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Transfer rejected');
    expect(sendMessagePromise.mock.calls.map(([message]) => message.service)).toEqual(['unjoin']);
    expect(screen.getAllByRole('checkbox').filter(box => (box as HTMLInputElement).checked)).toHaveLength(4);
  });

  it('does not pause after a four-room transfer disconnects mid-report', async () => {
    const all = ['living_room', 'bathroom', 'bedroom', 'gym'].map(room => `media_player.${room}`);
    const survivors = all.slice(1);
    for (const id of all) updateEntity(id, { state: 'playing' }, { group_members: all });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    updateEntity('media_player.bathroom', {}, { group_members: survivors });
    act(() => useStore.setState({ connectionStatus: 'disconnected' }));
    expect(screen.getByRole('alert').textContent).toContain('Connection interrupted');
    updateEntity('media_player.bedroom', {}, { group_members: survivors });
    updateEntity('media_player.gym', {}, { group_members: survivors });
    expect(sendMessagePromise.mock.calls.map(([message]) => message.service)).toEqual(['unjoin']);
  });

  it('does not pause changed audio on a detached coordinator with three survivors', async () => {
    const all = ['living_room', 'bathroom', 'bedroom', 'gym'].map(room => `media_player.${room}`);
    const survivors = all.slice(1);
    for (const id of all) updateEntity(id, { state: 'playing' }, { group_members: all, media_content_id: 'old-track' });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'], media_content_id: 'new-track' });
    for (const id of survivors) updateEntity(id, {}, { group_members: survivors });
    expect((await screen.findByRole('alert')).textContent).toContain('left untouched');
    expect(sendMessagePromise.mock.calls.map(([message]) => message.service)).toEqual(['unjoin']);
  });
  it('shows an honest compact empty state for an idle speaker with stale track metadata', async () => {
    updateEntity('media_player.living_room', { state: 'idle' });
    mount();
    expect(screen.getByText('Nothing playing')).toBeTruthy();
    expect(screen.queryByRole('slider', { name: 'Track position' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
    expect(screen.queryByText('Nothing playing')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Test track' })).toBeNull();
    expect(screen.queryByText('Now playing')).toBeNull();
    expect(screen.queryByText('Ready to play')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });
  it('keeps a named paused track and its resume control', async () => {
    updateEntity('media_player.living_room', { state: 'paused' });
    mount();
    expect(screen.getByText('Test track')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.queryByText('Now playing')).toBeNull();
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });
  it('describes active playback with no usable track title as a status', async () => {
    updateEntity('media_player.living_room', { state: 'playing' }, { media_title: '   ', media_playlist: ' ' });
    mount();
    expect(screen.getByText('Audio playing')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText('Now playing')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });
  it('shows speaker unavailable without presenting retained metadata as a track', async () => {
    updateEntity('media_player.living_room', { state: 'unavailable' }, { entity_picture: '/stale-cover.jpg' });
    mount();
    expect(screen.getByText('Speaker unavailable')).toBeTruthy();
    expect(screen.queryByText('Test artist')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
    expect(screen.queryByText('Speaker unavailable')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Test track' })).toBeNull();
    expect(screen.queryByText('Now playing')).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Track position' })).toBeNull();
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });
  it('keeps seeking on the main card and opens only artwork favourites in the library', async () => {
    browseMedia.mockResolvedValue({
      children: [
        { title: 'Evening jazz', media_content_id: 'jazz', media_content_type: 'playlist', can_play: true, thumbnail: '/jazz.jpg' },
      ],
    });
    mount();
    expect(screen.queryByRole('button', { name: 'Open player' })).toBeNull();
    const seek = screen.getByRole('slider', { name: 'Track position' });
    expect(seek.getAttribute('aria-valuetext')).toBe('0:40 of 3:20');
    const divider = seek.closest('.speaker-seek');
    expect(divider?.previousElementSibling?.contains(screen.getByRole('button', { name: 'Pause' }))).toBe(true);
    expect(divider?.nextElementSibling?.contains(screen.getByRole('switch', { name: 'Follow me' }))).toBe(true);
    expect(divider?.nextElementSibling?.contains(screen.getByRole('button', { name: 'Open speakers' }))).toBe(true);
    fireEvent.change(seek, { target: { value: '70' } });
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'media_seek', target: { entity_id: ['media_player.living_room'] }, service_data: { seek_position: 70 } })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByText('Test track')).toBeNull();
    expect(screen.queryByText('Test artist')).toBeNull();
    expect(screen.queryByText('Main speaker')).toBeNull();
    const favourite = await screen.findByRole('button', { name: 'Play Evening jazz' });
    expect(favourite.textContent).not.toContain('Evening jazz');
    const img = favourite.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('http://homeassistant.test/jazz.jpg');
    fireEvent.error(img);
    expect(favourite.querySelector('img')).toBeNull();
  });
  it('hides seek on a radio without duration and never invents artwork', async () => {
    updateEntity('media_player.living_room', {}, { media_duration: undefined, media_title: 'Live radio', entity_picture: undefined });
    mount();
    expect(screen.queryByRole('slider', { name: 'Track position' })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('shows passive progress when the speaker cannot seek', () => {
    updateEntity('media_player.living_room', {}, { supported_features: 1 | 16 | 32 | 16384 });
    mount();
    expect(screen.queryByRole('slider', { name: 'Track position' })).toBeNull();
    const progress = screen.getByRole('progressbar', { name: 'Track position' }) as HTMLProgressElement;
    expect(progress.value).toBe(40);
    expect(progress.max).toBe(200);
    expect(screen.getByText('0:40')).toBeTruthy();
    expect(screen.getByText('3:20')).toBeTruthy();
  });
  it('does not invent an elapsed position when the speaker omits it', () => {
    updateEntity('media_player.living_room', {}, { media_position: undefined });
    mount();
    expect(screen.queryByRole('slider', { name: 'Track position' })).toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Track position' })).toBeNull();
  });
  it('retains a pending Follow command across detail navigation and targets coordinator transport once', async () => {
    let resolve!: (value: unknown) => void;
    sendMessagePromise.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    mount();
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    expect((screen.getByRole('switch', { name: 'Follow me' }) as HTMLButtonElement).disabled).toBe(true);
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ response: { success: true } }));
  });
  it('requires confirmation before replacing other audio and revalidates changed conflicts', async () => {
    updateEntity('media_player.bathroom', { state: 'playing' }, { media_title: 'Other music' });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    const main = screen.getByRole('checkbox', { name: /Living Room/ }) as HTMLInputElement;
    expect(main.checked).toBe(true);
    expect(main.disabled).toBe(false);
    await userEvent.click(screen.getByRole('checkbox', { name: /bathroom/ }));
    expect(sendMessagePromise).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Other music');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sendMessagePromise).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('checkbox', { name: /bathroom/ }));
    updateEntity('media_player.bathroom', {}, { media_title: 'Changed music' });
    await userEvent.click(screen.getByRole('button', { name: 'Replace audio' }));
    expect(sendMessagePromise).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Changed music');
    await userEvent.click(screen.getByRole('button', { name: 'Replace audio' }));
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'join',
        target: { entity_id: ['media_player.living_room'] },
        service_data: { group_members: ['media_player.bathroom'] },
      })
    );
  });
  it('joins and removes rooms immediately, showing only confirmed membership', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /bathroom/ }));
    expect(sendMessagePromise).toHaveBeenCalledWith(expect.objectContaining({ service: 'join' }));
    expect(screen.getByRole('checkbox', { name: /bathroom/ }).closest('label')?.textContent).toContain('Joining…');
    expect((screen.getByRole('checkbox', { name: /bathroom/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole('button', { name: 'Apply rooms' })).toBeNull();
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room', 'media_player.gym', 'media_player.bathroom'] });
    await screen.findByText('Rooms updated.');
    expect((screen.getByRole('checkbox', { name: /bathroom/ }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /Gym/ }));
    expect(sendMessagePromise).toHaveBeenLastCalledWith(expect.objectContaining({ service: 'unjoin', target: { entity_id: ['media_player.gym'] } }));
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room', 'media_player.bathroom'] });
    await screen.findByText('Rooms updated.');
    expect((screen.getByRole('checkbox', { name: /Gym/ }) as HTMLInputElement).checked).toBe(false);
  });
  it('moves the main speaker only after the remaining topology confirms, then pauses the detached speaker', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    expect(sendMessagePromise).toHaveBeenLastCalledWith(expect.objectContaining({ service: 'unjoin', target: { entity_id: ['media_player.living_room'] } }));
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
    await act(async () => { updateEntity('media_player.gym', {}, { group_members: ['media_player.gym'] }); });
    expect(sendMessagePromise).toHaveBeenLastCalledWith(expect.objectContaining({ service: 'media_pause', target: { entity_id: ['media_player.living_room'] } }));
    await act(async () => { updateEntity('media_player.living_room', { state: 'paused' }); });
    expect((screen.getByRole('checkbox', { name: /Living Room/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: /Gym/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /Gym/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
    sendMessagePromise.mockResolvedValue({ response: { success: true } });
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    expect(sendMessagePromise).toHaveBeenLastCalledWith(expect.objectContaining({ service_data: { command: 'enable', source_entity: 'media_player.gym' } }));
  });

  it('keeps the new source and exposes a detached-speaker pause failure', async () => {
    sendMessagePromise.mockImplementation(async message => {
      if (message.service === 'media_pause') throw new Error('Pause failed');
      return { context: {} };
    });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    await act(async () => {
      updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
      updateEntity('media_player.gym', {}, { group_members: ['media_player.gym'] });
    });
    expect(screen.getByRole('alert').textContent).toContain('Pause failed');
    expect((screen.getByRole('checkbox', { name: /Living Room/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: /Gym/ }) as HTMLInputElement).checked).toBe(true);
  });

  it.each(['playing', 'paused'])('preserves original %s playback when the remaining queue is paused', async originalState => {
    updateEntity('media_player.living_room', { state: originalState });
    updateEntity('media_player.gym', { state: originalState });
    sendMessagePromise.mockImplementation(async message => {
      if (message.service === 'media_pause') updateEntity('media_player.living_room', { state: 'paused' });
      if (message.service === 'media_play') updateEntity('media_player.gym', { state: 'playing' });
      return { context: {} };
    });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    await act(async () => {
      updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
      updateEntity('media_player.gym', { state: 'paused' }, { group_members: ['media_player.gym'] });
    });
    expect(sendMessagePromise.mock.calls.some(([message]) => message.service === 'media_play')).toBe(originalState === 'playing');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps grouping failure visible without switching source', async () => {
    sendMessagePromise.mockRejectedValueOnce(new Error('Unjoin failed'));
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Unjoin failed');
    expect((screen.getByRole('checkbox', { name: /Living Room/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('does not pause audio when an unexpected room joins during transfer', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    await act(async () => {
      updateEntity('media_player.gym', {}, { group_members: ['media_player.gym', 'media_player.bathroom'] });
    });
    expect(screen.getByRole('alert').textContent).toContain('group changed');
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
  });

  it('preserves transfer errors when the old source goes idle and automatic source selection moves', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    await act(async () => {
      updateEntity('media_player.living_room', { state: 'idle' }, { group_members: ['media_player.living_room'] });
      updateEntity('media_player.gym', {}, { group_members: ['media_player.gym', 'media_player.bathroom'] });
    });
    expect(screen.getByRole('alert').textContent).toContain('group changed');
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
  });

  it('does not remove the main speaker when the remaining speaker is unavailable', async () => {
    updateEntity('media_player.gym', { state: 'unavailable' });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    expect(screen.getByRole('alert').textContent).toContain('unavailable');
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });

  it('keeps interrupted transfer feedback after disconnect and automatic source change', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    await act(async () => {
      updateEntity('media_player.living_room', { state: 'idle' }, { group_members: ['media_player.living_room'] });
      useStore.setState({ connectionStatus: 'disconnected' });
    });
    expect(screen.getByRole('alert').textContent).toContain('Connection interrupted');
    await act(async () => {
      updateEntity('media_player.gym', {}, { group_members: ['media_player.gym'] });
      useStore.setState({ connectionStatus: 'connected' });
    });
    expect(screen.getByRole('alert').textContent).toContain('Connection interrupted');
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
  });

  it('does not pause newly changed audio on the detached source', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    await act(async () => {
      updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'], media_title: 'New song' });
      updateEntity('media_player.gym', {}, { group_members: ['media_player.gym'] });
    });
    expect(screen.getByRole('alert').textContent).toContain('left untouched');
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
  });

  it('keeps the last room selected', async () => {
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Living Room/ }));
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });

  it('keeps failed room changes unselected and retries from the latest group on another tap', async () => {
    sendMessagePromise.mockRejectedValueOnce(new Error('Network error'));
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /bathroom/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Network error');
    expect((screen.getByRole('checkbox', { name: /bathroom/ }) as HTMLInputElement).checked).toBe(false);
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    await userEvent.click(screen.getByRole('checkbox', { name: /bathroom/ }));
    expect(sendMessagePromise).toHaveBeenCalledTimes(2);
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room', 'media_player.bathroom'] });
    await screen.findByText('Rooms updated.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('checkbox', { name: /bathroom/ }) as HTMLInputElement).checked).toBe(true);
  });
  it('cancels queued volumes on same-socket disconnect, even if it reconnects before the response', async () => {
    const socket = useStore.getState().connection!;
    const disconnected = new Set<() => void>();
    Object.assign(socket, {
      addEventListener: (_event: string, fn: () => void) => disconnected.add(fn),
      removeEventListener: (_event: string, fn: () => void) => disconnected.delete(fn),
    });
    let resolve!: (value: unknown) => void;
    sendMessagePromise.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    const view = mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase volume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase volume' }));
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
    await act(async () => {
      disconnected.forEach(fn => fn());
    });
    await act(async () => resolve({}));
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('Reconnecting');
    view.unmount();
    expect(disconnected.size).toBe(0);
  });
  it('filters group-volume and mute targets by each room capability', async () => {
    updateEntity('media_player.gym', {}, { supported_features: 1, volume_level: undefined });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('button', { name: 'Increase volume' }));
    expect(sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service: 'volume_set', target: { entity_id: ['media_player.living_room'] } })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ service: 'volume_mute', target: { entity_id: ['media_player.living_room'] } })
    );
  });
  it('closes favourites only after Home Assistant confirms playback', async () => {
    browseMedia.mockResolvedValue({
      children: [{ title: 'Evening jazz', media_content_id: 'jazz', media_content_type: 'playlist', can_play: true }],
    });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Play Evening jazz' }));
    expect(screen.getByText('Starting Evening jazz…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open favourites' })).toBeNull();
    updateEntity('media_player.living_room', {}, { media_title: 'New jazz track', media_content_id: 'jazz-track' });
    expect(await screen.findByRole('button', { name: 'Open favourites' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play Evening jazz' })).toBeNull();
    expect(screen.getByText('New jazz track')).toBeTruthy();
  });
  it('keeps favourites open with its error when playback fails', async () => {
    browseMedia.mockResolvedValue({
      children: [{ title: 'Evening jazz', media_content_id: 'jazz', media_content_type: 'playlist', can_play: true }],
    });
    sendMessagePromise.mockRejectedValue(new Error('Speaker offline'));
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Play Evening jazz' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Speaker offline');
    expect((screen.getByRole('button', { name: 'Play Evening jazz' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('does not close speakers when a dismissed favourite request later succeeds', async () => {
    browseMedia.mockResolvedValue({
      children: [{ title: 'Evening jazz', media_content_id: 'jazz', media_content_type: 'playlist', can_play: true }],
    });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Play Evening jazz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    updateEntity('media_player.living_room', {}, { media_title: 'New jazz track', media_content_id: 'jazz-track' });
    await act(async () => {});
    expect(screen.getByRole('checkbox', { name: /bathroom/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open favourites' })).toBeNull();
  });
  it('retains favourite confirmation across closing and reopening Favourites', async () => {
    browseMedia.mockResolvedValue({
      children: [{ title: 'Evening jazz', media_content_id: 'jazz', media_content_type: 'playlist', can_play: true }],
    });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Play Evening jazz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
    expect(((await screen.findByRole('button', { name: 'Play Evening jazz' })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Starting Evening jazz…')).toBeTruthy();
    updateEntity('media_player.living_room', {}, { media_title: 'New jazz track', media_content_id: 'jazz-track' });
    await act(async () => {});
    expect((screen.getByRole('button', { name: 'Play Evening jazz' }) as HTMLButtonElement).disabled).toBe(false);
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
  });
  it('bounds recursive favourite browsing and allows a real retry', async () => {
    browseMedia.mockImplementation((message: { media_content_id: string }) =>
      Promise.resolve({ children: [{ media_content_type: 'folder', media_content_id: message.media_content_id + 'x', can_expand: true }] })
    );
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
    await screen.findByRole('button', { name: 'Retry favourites' });
    expect(browseMedia).toHaveBeenCalledTimes(6);
    browseMedia.mockResolvedValue({ children: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Retry favourites' }));
    expect(await screen.findByText('Choose this speaker in your music app.')).toBeTruthy();
  });
  it('blocks Follow changes while its HA script is running', async () => {
    updateEntity('script.speaker_follow_motion', { state: 'on' });
    mount();
    expect((screen.getByRole('switch', { name: 'Follow me' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });
  it('hands Follow to manual grouping while waiting for an active motion script, keeping rooms intact', async () => {
    updateEntity('input_boolean.speaker_follow_motion', { state: 'on' });
    updateEntity('input_text.speaker_follow_source', { state: 'media_player.living_room' });
    updateEntity('script.speaker_follow_motion', { state: 'on' });
    sendMessagePromise.mockImplementation(async (message: { service: string }) => {
      if (message.service === 'turn_off') updateEntity('input_boolean.speaker_follow_motion', { state: 'off' });
      if (message.service === 'set_value') updateEntity('input_text.speaker_follow_source', { state: '' });
      return {};
    });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    const playIn = screen.getByRole('region', { name: 'Speaker rooms' });
    expect(playIn.textContent).toContain('Follow me is managing these rooms.');
    expect(playIn.contains(screen.getByRole('button', { name: 'Switch to manual grouping' }))).toBe(true);
    expect((screen.getByRole('checkbox', { name: /Gym/ }) as HTMLInputElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to manual grouping' }));
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
    updateEntity('script.speaker_follow_motion', { state: 'off' });
    expect(await screen.findByText('Manual grouping is on. Your rooms are unchanged.')).toBeTruthy();
    expect(sendMessagePromise).toHaveBeenCalledTimes(2);
    expect(sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ domain: 'input_text', service: 'set_value', service_data: { value: '' } })
    );
    expect((screen.getByRole('checkbox', { name: /Gym/ }) as HTMLInputElement).checked).toBe(true);
  });
  it('keeps only group volume and contextual audio source controls', async () => {
    updateEntity('media_player.bathroom', { state: 'playing' });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    expect(screen.queryByText('Individual speakers')).toBeNull();
    expect(screen.queryByText('Advanced')).toBeNull();
    expect(screen.queryByLabelText('Use audio from')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Change source' }));
    expect(screen.getByLabelText('Use audio from')).toBeTruthy();
    updateEntity('media_player.bathroom', { state: 'idle' });
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(screen.queryByLabelText('Use audio from')).toBeNull();
    updateEntity('media_player.bathroom', { state: 'paused' });
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Use audio from')).toBeNull();
    expect(screen.queryByRole('button', { name: /Adjust .* volume/ })).toBeNull();
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    expect(screen.getByRole('slider', { name: 'Group volume' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /Gym/ }) as HTMLInputElement).checked).toBe(true);
  });
  it('uses group volume alone when only one room is playing', async () => {
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    updateEntity('media_player.gym', { state: 'idle' }, { group_members: ['media_player.gym'] });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    expect(screen.getByRole('slider', { name: 'Group volume' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Adjust Living Room volume' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change source' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Play in' })).toBeNull();
  });
  it('re-enables controls on an in-place socket reconnect without replaying commands', async () => {
    const socket = useStore.getState().connection!;
    const events = new Map<string, Set<() => void>>();
    Object.assign(socket, {
      addEventListener: (event: string, fn: () => void) => {
        if (!events.has(event)) events.set(event, new Set());
        events.get(event)!.add(fn);
      },
      removeEventListener: (event: string, fn: () => void) => events.get(event)?.delete(fn),
    });
    const view = mount();
    expect((screen.getByRole('switch', { name: 'Follow me' }) as HTMLButtonElement).disabled).toBe(false);
    act(() => {
      Object.assign(socket, { connected: false });
      events.get('disconnected')?.forEach(fn => fn());
    });
    expect((screen.getByRole('switch', { name: 'Follow me' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      Object.assign(socket, { connected: true });
      events.get('ready')?.forEach(fn => fn());
    });
    expect((screen.getByRole('switch', { name: 'Follow me' }) as HTMLButtonElement).disabled).toBe(false);
    expect(sendMessagePromise).not.toHaveBeenCalled();
    view.unmount();
    expect([...events.values()].every(listeners => listeners.size === 0)).toBe(true);
  });
  it('blocks cleanup retry and its shared action while manual handoff is clearing the saved source', async () => {
    updateEntity('input_boolean.speaker_follow_motion', { state: 'on' });
    updateEntity('input_text.speaker_follow_source', { state: 'media_player.living_room' });
    sendMessagePromise.mockImplementation(async (message: { service: string }) => {
      if (message.service === 'turn_off') updateEntity('input_boolean.speaker_follow_motion', { state: 'off' });
      if (message.service === 'set_value') return new Promise(() => {});
      return { response: { success: true } };
    });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
    await userEvent.click(screen.getByRole('button', { name: 'Switch to manual grouping' }));
    expect(sendMessagePromise).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Request cleanup directly' }));
    expect(sendMessagePromise).toHaveBeenCalledTimes(2);
    const retry = screen.getByRole('button', { name: 'Retry ungrouping' }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    await userEvent.click(retry);
    expect(sendMessagePromise).toHaveBeenCalledTimes(2);
  });
  it.each(['join', 'unjoin'])(
    'stops subsequent grouping writes when unrelated membership changes during %s confirmation',
    async operation => {
      mount();
      await userEvent.click(screen.getByRole('button', { name: 'Open speakers' }));
      await userEvent.click(screen.getByRole('checkbox', { name: operation === 'join' ? /bathroom/ : /Gym/ }));
        expect(sendMessagePromise).toHaveBeenCalledTimes(1);
      expect(sendMessagePromise).toHaveBeenLastCalledWith(expect.objectContaining({ service: operation }));
      await act(async () => {
        updateEntity(
          'media_player.living_room',
          {},
          {
            group_members:
              operation === 'join'
                ? ['media_player.living_room', 'media_player.bathroom']
                : ['media_player.living_room', 'media_player.bedroom'],
          }
        );
      });
      expect(sendMessagePromise).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('alert').textContent).toContain('group changed');
    }
  );
});

it('labels missing and failed favourite artwork while leaving successful artwork title-free', async () => {
  browseMedia.mockResolvedValue({
    children: [
      { title: 'A long favourite playlist title', media_content_id: 'one', media_content_type: 'playlist', can_play: true },
      { title: 'Broken cover', media_content_id: 'two', media_content_type: 'playlist', can_play: true, thumbnail: '/broken.jpg' },
    ],
  });
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Open favourites' }));
  expect((await screen.findByRole('button', { name: 'Play A long favourite playlist title' })).textContent).toContain(
    'A long favourite playlist title'
  );
  const broken = screen.getByRole('button', { name: 'Play Broken cover' });
  expect(broken.textContent).not.toContain('Broken cover');
  fireEvent.error(broken.querySelector('img')!);
  expect(broken.textContent).toContain('Broken cover');
});

it('shows all-muted, partly muted and unknown states truthfully and keeps opening speaker settings command-free', async () => {
  updateEntity('media_player.living_room', {}, { is_volume_muted: true });
  updateEntity('media_player.gym', {}, { is_volume_muted: true });
  mount();
  expect(screen.getByRole('button', { name: 'Open speaker volume, muted' }).textContent).toBe('Muted');
  updateEntity('media_player.gym', {}, { is_volume_muted: false });
  expect(screen.getByRole('button', { name: 'Open speaker volume, some muted' }).textContent).toBe('Some muted');
  updateEntity('media_player.living_room', {}, { is_volume_muted: undefined });
  expect(screen.getByRole('button', { name: 'Open speaker volume' }).textContent).toBe('34%');
  await userEvent.click(screen.getByRole('button', { name: 'Open speaker volume' }));
  expect(screen.getByRole('region', { name: 'Speaker rooms' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Apply rooms' })).toBeNull();
  expect(sendMessagePromise).not.toHaveBeenCalled();
});

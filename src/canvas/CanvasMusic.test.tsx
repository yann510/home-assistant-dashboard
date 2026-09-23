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
        <CanvasPlayer />
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
  it('opens Player with real time seeking and artwork-only favourites, without volume or source controls', async () => {
    browseMedia.mockResolvedValue({
      children: [
        { title: 'Evening jazz', media_content_id: 'jazz', media_content_type: 'playlist', can_play: true, thumbnail: '/jazz.jpg' },
      ],
    });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open player' }));
    expect(screen.queryByRole('slider', { name: /volume/i })).toBeNull();
    expect(screen.queryByText('Main speaker')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Track position' }).getAttribute('aria-valuetext')).toBe('0:40 of 3:20');
    const favourite = await screen.findByRole('button', { name: 'Play Evening jazz' });
    expect(favourite.textContent).not.toContain('Evening jazz');
    const img = favourite.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('http://homeassistant.test/jazz.jpg');
    fireEvent.error(img);
    expect(favourite.querySelector('img')).toBeNull();
    fireEvent.change(screen.getByRole('slider', { name: 'Track position' }), { target: { value: '70' } });
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'media_seek',
        target: { entity_id: ['media_player.living_room'] },
        service_data: { seek_position: 70 },
      })
    );
  });
  it('hides seek on a radio without duration and never invents artwork', async () => {
    updateEntity('media_player.living_room', {}, { media_duration: undefined, media_title: 'Live radio', entity_picture: undefined });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open player' }));
    expect(screen.queryByRole('slider', { name: 'Track position' })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
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
    expect(main.disabled).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /bathroom/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply rooms' }));
    expect(sendMessagePromise).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Other music');
    updateEntity('media_player.bathroom', {}, { media_title: 'Changed music' });
    await userEvent.click(screen.getByRole('button', { name: 'Replace audio and apply' }));
    expect(sendMessagePromise).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Changed music');
    await userEvent.click(screen.getByRole('button', { name: 'Replace audio and apply' }));
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'join',
        target: { entity_id: ['media_player.living_room'] },
        service_data: { group_members: ['media_player.bathroom'] },
      })
    );
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
  it('retains favourite confirmation across closing and reopening Player', async () => {
    browseMedia.mockResolvedValue({
      children: [{ title: 'Evening jazz', media_content_id: 'jazz', media_content_type: 'playlist', can_play: true }],
    });
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Open player' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Play Evening jazz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open player' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Open player' }));
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
      await userEvent.click(screen.getByRole('checkbox', { name: /bathroom/ }));
      if (operation === 'join') await userEvent.click(screen.getByRole('checkbox', { name: /bedroom/ }));
      else await userEvent.click(screen.getByRole('checkbox', { name: /Gym/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Apply rooms' }));
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

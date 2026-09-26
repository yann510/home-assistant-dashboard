// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HassContext, useStore, type HassContextProps } from '@hakit/core';
import type { Connection, HassEntities } from 'home-assistant-js-websocket';
import { SpeakerVolume } from './SpeakerVolume';

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

describe('Room picker and group volume', () => {
  it('rechecks confirmed membership when dispatching a volume change', async () => {
    render(
      <HassContext.Provider value={context}>
        <SpeakerVolume entityId='media_player.living_room' targets={['media_player.living_room', 'media_player.gym']} disabled={false} />
      </HassContext.Provider>
    );
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    await userEvent.click(screen.getByRole('button', { name: 'Increase volume' }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      service: 'volume_set',
      target: { entity_id: ['media_player.living_room'] },
      service_data: { volume_level: 0.36 },
    }));
  });

  it('includes a newly confirmed room when a volume gesture ends', async () => {
    render(
      <HassContext.Provider value={context}>
        <SpeakerVolume entityId='media_player.living_room' targets={['media_player.living_room', 'media_player.gym']} disabled={false} />
      </HassContext.Provider>
    );
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '50' } });
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room', 'media_player.gym', 'media_player.bathroom'] });
    await act(async () => { fireEvent.pointerUp(slider); });
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      service: 'volume_set',
      target: { entity_id: ['media_player.living_room', 'media_player.gym', 'media_player.bathroom'] },
      service_data: { volume_level: 0.5 },
    }));
  });

});

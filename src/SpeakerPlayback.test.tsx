// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HassContext, useStore, type HassContextProps } from '@hakit/core';
import type { Connection, HassEntities } from 'home-assistant-js-websocket';
import { SpeakerCard } from './SpeakerCard';

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

function mountCard(compact = false) {
  return render(
    <HassContext.Provider value={context}>
      <SpeakerCard compact={compact} />
    </HassContext.Provider>
  );
}

function openVolume() {
  fireEvent.click(screen.getByRole('button', { name: 'Volume controls' }));
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

describe('Speaker playback controls', () => {
  it('sends Pause once to the coordinator, without pausing unrelated speakers or repeating it for followers', async () => {
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith({
      type: 'call_service',
      domain: 'media_player',
      service: 'media_pause',
      target: { entity_id: ['media_player.living_room'] },
    });
  });

  it.each([
    ['paused', 'Resume', 'media_play'],
    ['playing', 'Previous track', 'media_previous_track'],
    ['playing', 'Next track', 'media_next_track'],
  ] as const)('handles %s / %s', async (state, label, service) => {
    updateEntity('media_player.living_room', { state });
    updateEntity('media_player.gym', { state });
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith({
      type: 'call_service',
      domain: 'media_player',
      service,
      target: { entity_id: ['media_player.living_room'] },
    });
  });

  it('shows rejected pause commands and lets the user retry', async () => {
    sendMessagePromise.mockRejectedValueOnce({ message: 'Living Room did not respond.' });
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Living Room did not respond.');
    expect(screen.getByRole('button', { name: 'Pause' }).hasAttribute('disabled')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(sendMessagePromise).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not send duplicate transport commands while waiting', async () => {
    sendMessagePromise.mockReturnValue(new Promise(() => {}));
    mountCard();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(sendMessagePromise).toHaveBeenCalledOnce();
  });

  it('recovers from a command that never responds', async () => {
    vi.useFakeTimers();
    sendMessagePromise.mockReturnValue(new Promise(() => {}));
    mountCard();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(screen.getByRole('alert').textContent).toMatch(/respond|timed out/i);
    expect(screen.getByRole('button', { name: 'Pause' }).hasAttribute('disabled')).toBe(false);
  });

  it('uses the pause capability while playing, even when play is unsupported', () => {
    updateEntity('media_player.living_room', {}, { supported_features: 1 });
    mountCard();
    expect(screen.getByRole('button', { name: 'Pause' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Next track' }).hasAttribute('disabled')).toBe(true);
  });

  it('does not switch the Follow me source when that speaker becomes unavailable', () => {
    updateEntity('input_boolean.speaker_follow_motion', { state: 'on' });
    updateEntity('input_text.speaker_follow_source', { state: 'media_player.living_room' });
    updateEntity('media_player.living_room', { state: 'unavailable' });
    updateEntity('media_player.bathroom', { state: 'playing' });
    mountCard();
    expect(screen.getByText(/Living Room is unavailable/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Favourites' }).hasAttribute('disabled')).toBe(true);
  });

  it('disables commands while disconnected', () => {
    useStore.setState({ connectionStatus: 'disconnected' });
    mountCard();
    expect(screen.getByRole('button', { name: 'Pause' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('Speaker volume and touch interaction', () => {
  it('keeps dragging local, ignores delayed state echoes, and commits the final value on release', async () => {
    mountCard();
    openVolume();
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '52' } });
    updateEntity('media_player.living_room', {}, { volume_level: 0.36 });
    expect((slider as HTMLInputElement).value).toBe('52');
    expect(sendMessagePromise).not.toHaveBeenCalled();
    fireEvent.change(slider, { target: { value: '56' } });
    await act(async () => fireEvent.pointerUp(slider));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith({
      type: 'call_service',
      domain: 'media_player',
      service: 'volume_set',
      target: { entity_id: ['media_player.living_room', 'media_player.gym'] },
      service_data: { volume_level: 0.56 },
    });
    expect((slider as HTMLInputElement).value).toBe('56');
    expect(screen.queryByRole('dialog', { name: 'Speakers' })).toBeNull();
  });

  it('allows precise volume changes with the keyboard', async () => {
    mountCard();
    openVolume();
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.change(slider, { target: { value: '35' } });
    await act(async () => fireEvent.keyUp(slider, { key: 'ArrowRight' }));
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'volume_set', service_data: { volume_level: 0.35 } })
    );
  });

  it('coalesces rapid volume taps and sends them in order', async () => {
    let finish!: (value: unknown) => void;
    sendMessagePromise.mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    mountCard();
    openVolume();
    const plus = screen.getByRole('button', { name: 'Increase volume' });
    await userEvent.click(plus);
    await userEvent.click(plus);
    await userEvent.click(plus);
    expect(sendMessagePromise).toHaveBeenCalledOnce();
    expect((screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement).value).toBe('40');
    await act(async () => finish({ context: {} }));
    expect(sendMessagePromise.mock.calls.map(([message]) => message.service_data.volume_level)).toEqual([0.36, 0.4]);
  });

  it('drops queued volume commands if the connection is lost', async () => {
    let finish!: (value: unknown) => void;
    sendMessagePromise.mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    mountCard();
    openVolume();
    const plus = screen.getByRole('button', { name: 'Increase volume' });
    await userEvent.click(plus);
    await userEvent.click(plus);
    act(() => useStore.setState({ connectionStatus: 'disconnected' }));
    await act(async () => finish({ context: {} }));
    expect(sendMessagePromise).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toContain('Reconnecting');
  });

  it('drops queued group volume when the group changes', async () => {
    let finish!: (value: unknown) => void;
    sendMessagePromise.mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    mountCard();
    openVolume();
    const plus = screen.getByRole('button', { name: 'Increase volume' });
    await userEvent.click(plus);
    await userEvent.click(plus);
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    await act(async () => finish({ context: {} }));
    expect(sendMessagePromise).toHaveBeenCalledOnce();
  });

  it.each([
    [0.99, 'Increase volume', 1],
    [0.01, 'Decrease volume', 0],
  ] as const)('clamps volume at %s', async (level, label, expected) => {
    updateEntity('media_player.living_room', {}, { volume_level: level });
    mountCard();
    openVolume();
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(sendMessagePromise).toHaveBeenCalledWith(expect.objectContaining({ service_data: { volume_level: expected } }));
    expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true);
  });

  it('shows volume failures and restores the reported level', async () => {
    sendMessagePromise.mockRejectedValue({ message: 'Speaker did not respond.' });
    mountCard();
    openVolume();
    await userEvent.click(screen.getByRole('button', { name: 'Increase volume' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Speaker did not respond.');
    expect((screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement).value).toBe('34');
  });

  it('mutes the current group and unmutes using the reported mute state', async () => {
    mountCard();
    openVolume();
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(sendMessagePromise).toHaveBeenCalledWith({
      type: 'call_service',
      domain: 'media_player',
      service: 'volume_mute',
      target: { entity_id: ['media_player.living_room', 'media_player.gym'] },
      service_data: { is_volume_muted: true },
    });
    updateEntity('media_player.living_room', {}, { is_volume_muted: true });
    updateEntity('media_player.gym', {}, { is_volume_muted: true });
    await userEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(sendMessagePromise).toHaveBeenLastCalledWith(expect.objectContaining({ service_data: { is_volume_muted: false } }));
  });

  it('exposes direct seeking without opening another panel', () => {
    mountCard();
    expect(screen.getByRole('slider', { name: 'Track position' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Seek in track' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });
});

describe('Track progress', () => {
  it('seeks once on release to the source speaker and preserves the draft during state updates', async () => {
    mountCard();
    const slider = screen.getByRole('slider', { name: 'Track position' });
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 216 } as DOMRect);
    fireEvent.pointerDown(slider, { clientX: 48, clientY: 20, button: 0 });
    fireEvent.pointerMove(slider, { clientX: 108, clientY: 20 });
    updateEntity('media_player.living_room', {}, { media_position: 45 });
    expect((slider as HTMLInputElement).value).toBe('100');
    expect(sendMessagePromise).not.toHaveBeenCalled();
    await act(async () => fireEvent.pointerUp(slider, { clientX: 108, clientY: 20 }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith({
      type: 'call_service',
      domain: 'media_player',
      service: 'media_seek',
      target: { entity_id: ['media_player.living_room'] },
      service_data: { seek_position: 100 },
    });
  });

  it('shows a failed seek and restores the reported position', async () => {
    sendMessagePromise.mockRejectedValue({ message: 'Cannot seek this track.' });
    mountCard();
    const slider = screen.getByRole('slider', { name: 'Track position' });
    fireEvent.change(slider, { target: { value: '100' } });
    await act(async () => fireEvent.keyUp(slider, { key: 'ArrowRight' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Cannot seek this track.');
    expect((slider as HTMLInputElement).value).toBe('40');
  });

  it('shows passive progress when seeking is unsupported', () => {
    updateEntity('media_player.living_room', {}, { supported_features: 1 });
    mountCard();
    expect(screen.queryByRole('slider', { name: 'Track position' })).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Track position' }).getAttribute('value')).toBe('40');
  });
});

describe('Volume gesture recovery', () => {
  it('resumes device updates after holding and releasing without changing volume', async () => {
    vi.useFakeTimers();
    mountCard();
    openVolume();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Increase volume' })));
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.pointerDown(slider);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.queryByRole('dialog', { name: 'Speakers' })).toBeNull();
    fireEvent.pointerUp(slider);
    updateEntity('media_player.living_room', {}, { volume_level: 0.4 });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect((slider as HTMLInputElement).value).toBe('40');
  });

  it('cancels a touch gesture without sending volume or opening details', () => {
    mountCard();
    openVolume();
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '70' } });
    fireEvent.pointerCancel(slider);
    expect(sendMessagePromise).not.toHaveBeenCalled();
    expect((slider as HTMLInputElement).value).toBe('34');
    expect(screen.queryByRole('dialog', { name: 'Speakers' })).toBeNull();
  });

  it('supports assistive controls that change the range without a pointer or key release', async () => {
    mountCard();
    openVolume();
    await act(async () => fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '35' } }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ service: 'volume_set', service_data: { volume_level: 0.35 } })
    );
  });
});

describe('Artwork and on-demand volume', () => {
  it('shows direct progress while keeping volume tucked away', () => {
    updateEntity('media_player.living_room', {}, { entity_picture: '/api/media_player_proxy/living_room' });
    const { container } = mountCard();
    expect(screen.queryByRole('slider', { name: 'Volume' })).toBeNull();
    expect((screen.getByRole('slider', { name: 'Track position' }) as HTMLInputElement).value).toBe('40');
    expect(container.querySelector('.speaker-artwork')?.getAttribute('src')).toBe(
      'http://homeassistant.test/api/media_player_proxy/living_room'
    );
    expect(screen.getByRole('button', { name: 'Volume controls' }).textContent).toContain('34%');
  });

  it('opens a labelled volume popup without sending a command or opening details', () => {
    mountCard();
    openVolume();
    const popup = screen.getByRole('dialog', { name: 'Volume' });
    expect(within(popup).getByRole('slider', { name: 'Volume' })).toBe(document.activeElement);
    expect(within(popup).getByRole('button', { name: 'Mute' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Volume controls' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('dialog', { name: 'Speakers' })).toBeNull();
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });

  it('stays open during a long volume drag', async () => {
    vi.useFakeTimers();
    mountCard();
    openVolume();
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '45' } });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByRole('dialog', { name: 'Volume' })).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Speakers' })).toBeNull();
    expect(sendMessagePromise).not.toHaveBeenCalled();
    await act(async () => fireEvent.pointerUp(slider));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ service: 'volume_set', service_data: { volume_level: 0.45 } })
    );
  });

  it.each(['close', 'escape', 'trigger'])('dismisses volume with %s and restores focus', async method => {
    mountCard();
    openVolume();
    if (method === 'close') await userEvent.click(screen.getByRole('button', { name: 'Close volume controls' }));
    if (method === 'escape') fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume' }), { key: 'Escape' });
    if (method === 'trigger') await userEvent.click(screen.getByRole('button', { name: 'Volume controls' }));
    expect(screen.queryByRole('dialog', { name: 'Volume' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Volume' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Volume controls' }));
  });

  it('tracks native light-dismiss when the user taps outside', () => {
    mountCard();
    openVolume();
    const event = Object.assign(new Event('toggle'), { newState: 'closed' });
    fireEvent(screen.getByRole('dialog', { name: 'Volume' }), event);
    expect(screen.getByRole('button', { name: 'Volume controls' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('slider', { name: 'Volume' })).toBeNull();
  });

  it('keeps command failures visible when the popup is dismissed before the response', async () => {
    let reject!: (reason: unknown) => void;
    sendMessagePromise.mockReturnValueOnce(
      new Promise((_, failure) => {
        reject = failure;
      })
    );
    mountCard();
    openVolume();
    await userEvent.click(screen.getByRole('button', { name: 'Increase volume' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close volume controls' }));
    await act(async () => reject({ message: 'Speaker did not respond.' }));
    expect(screen.getByRole('alert').textContent).toContain('Speaker did not respond.');
    expect(screen.queryByRole('dialog', { name: 'Volume' })).toBeNull();
  });
});

describe('Room picker and balanced group volume', () => {
  it('preserves room volume differences during dragging despite delayed echoes', async () => {
    updateEntity('media_player.living_room', {}, { volume_level: 0.4 });
    updateEntity('media_player.gym', {}, { volume_level: 0.2 });
    mountCard();
    openVolume();
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '50' } });
    updateEntity('media_player.gym', {}, { volume_level: 0.23 });
    await act(async () => fireEvent.pointerUp(slider));
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'volume_set',
        target: { entity_id: ['media_player.living_room'] },
        service_data: { volume_level: 0.5 },
      })
    );
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'volume_set', target: { entity_id: ['media_player.gym'] }, service_data: { volume_level: 0.3 } })
    );
  });

  it('opens rooms without changing playback and edits only a connected room volume', async () => {
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: /Playing in/ }));
    const panel = screen.getByRole('dialog', { name: 'Play in' });
    expect(
      within(panel)
        .getByRole('checkbox', { name: /Living Room/ })
        .hasAttribute('disabled')
    ).toBe(true);
    expect(sendMessagePromise).not.toHaveBeenCalled();
    await userEvent.click(within(panel).getByRole('button', { name: 'Increase Gym volume' }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ service: 'volume_set', target: { entity_id: ['media_player.gym'] }, service_data: { volume_level: 0.36 } })
    );
  });

  it('stages room selection, applies only the difference, and waits for confirmed membership', async () => {
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: /Playing in/ }));
    const panel = screen.getByRole('dialog', { name: 'Play in' });
    await userEvent.click(within(panel).getByRole('checkbox', { name: /bathroom/ }));
    expect(sendMessagePromise).not.toHaveBeenCalled();
    expect(within(panel).queryByRole('slider', { name: 'bathroom volume' })).toBeNull();
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply' }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        service: 'join',
        target: { entity_id: ['media_player.living_room'] },
        service_data: { group_members: ['media_player.bathroom'] },
      })
    );
    expect(within(panel).getByRole('status', { name: 'Room update' }).textContent).toContain('Connecting');
    updateEntity(
      'media_player.living_room',
      {},
      { group_members: ['media_player.living_room', 'media_player.gym', 'media_player.bathroom'] }
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(within(panel).getByRole('slider', { name: 'bathroom volume' })).toBeTruthy();
    expect(within(panel).getByRole('status', { name: 'Room update' }).textContent).toContain('updated');
  });

  it('removes a follower without unjoining the source or unrelated speakers', async () => {
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: /Playing in/ }));
    const panel = screen.getByRole('dialog', { name: 'Play in' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Only Living Room' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply' }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ service: 'unjoin', target: { entity_id: ['media_player.gym'] } })
    );
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    await act(async () => {
      await Promise.resolve();
    });
    expect(within(panel).getByRole('status', { name: 'Room update' }).textContent).toContain('updated');
  });

  it('names a failed room and keeps the selection available to retry', async () => {
    sendMessagePromise.mockRejectedValue({ message: 'Offline' });
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: /Playing in/ }));
    const panel = screen.getByRole('dialog', { name: 'Play in' });
    await userEvent.click(within(panel).getByRole('checkbox', { name: /bathroom/ }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply' }));
    expect(within(panel).getByRole('alert').textContent).toContain('bathroom');
    expect((within(panel).getByRole('checkbox', { name: /bathroom/ }) as HTMLInputElement).checked).toBe(true);
    expect(within(panel).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('Room grouping edge cases', () => {
  it('switches off motion following without unjoining rooms, waiting for an in-flight motion join', async () => {
    updateEntity('input_boolean.speaker_follow_motion', { state: 'on' });
    updateEntity('input_text.speaker_follow_source', { state: 'media_player.living_room' });
    updateEntity('script.speaker_follow_motion', { state: 'on' });
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: /Playing in/ }));
    const panel = screen.getByRole('dialog', { name: 'Play in' });
    expect(
      within(panel)
        .getByRole('checkbox', { name: /bathroom/ })
        .hasAttribute('disabled')
    ).toBe(true);
    await userEvent.click(within(panel).getByRole('button', { name: 'Switch to manual grouping' }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ domain: 'input_boolean', service: 'turn_off' }));
    updateEntity('input_boolean.speaker_follow_motion', { state: 'off' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(sendMessagePromise).toHaveBeenCalledOnce();
    updateEntity('script.speaker_follow_motion', { state: 'off' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(sendMessagePromise).toHaveBeenLastCalledWith(
      expect.objectContaining({ domain: 'input_text', service: 'set_value', service_data: { value: '' } })
    );
    updateEntity('input_text.speaker_follow_source', { state: '' });
    await act(async () => {
      await Promise.resolve();
    });
    expect((within(panel).getByRole('checkbox', { name: /Gym/ }) as HTMLInputElement).checked).toBe(true);
    expect(
      within(panel)
        .getByRole('checkbox', { name: /bathroom/ })
        .hasAttribute('disabled')
    ).toBe(false);
    expect(sendMessagePromise.mock.calls.some(([message]) => message.service === 'unjoin')).toBe(false);
  });

  it('reports a confirmation timeout rather than claiming a room connected', async () => {
    vi.useFakeTimers();
    mountCard();
    fireEvent.click(screen.getByRole('button', { name: /Playing in/ }));
    const panel = screen.getByRole('dialog', { name: 'Play in' });
    fireEvent.click(within(panel).getByRole('checkbox', { name: /bathroom/ }));
    await act(async () => fireEvent.click(within(panel).getByRole('button', { name: 'Apply' })));
    await act(async () => vi.advanceTimersByTime(15001));
    expect(within(panel).getByRole('alert').textContent).toContain('did not confirm');
    expect(within(panel).queryByRole('slider', { name: 'bathroom volume' })).toBeNull();
  });

  it('does not overwrite a group that changed while the picker was open', async () => {
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: /Playing in/ }));
    const panel = screen.getByRole('dialog', { name: 'Play in' });
    await userEvent.click(within(panel).getByRole('checkbox', { name: /bathroom/ }));
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply' }));
    expect(sendMessagePromise).not.toHaveBeenCalled();
    expect(within(panel).getByRole('alert').textContent).toContain('changed elsewhere');
  });

  it('discards staged membership when dismissed', async () => {
    mountCard();
    await userEvent.click(screen.getByRole('button', { name: /Playing in/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /bathroom/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Close room picker' }));
    await userEvent.click(screen.getByRole('button', { name: /Playing in/ }));
    expect((screen.getByRole('checkbox', { name: /bathroom/ }) as HTMLInputElement).checked).toBe(false);
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });

  it('captures a fresh balance after an untouched gesture', async () => {
    mountCard();
    openVolume();
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);
    updateEntity('media_player.gym', {}, { volume_level: 0.2 });
    await userEvent.click(screen.getByRole('button', { name: 'Increase volume' }));
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({ target: { entity_id: ['media_player.gym'] }, service_data: { volume_level: 0.22 } })
    );
  });
});

describe('Mixed group levels', () => {
  it('does not label an audible group muted when only its source is muted', () => {
    updateEntity('media_player.living_room', {}, { is_volume_muted: true });
    mountCard();
    openVolume();
    expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unmute' })).toBeNull();
  });
  it('clamps each room independently while retaining differences elsewhere', async () => {
    updateEntity('media_player.living_room', {}, { volume_level: 0.4 });
    updateEntity('media_player.gym', {}, { volume_level: 0.95 });
    mountCard();
    openVolume();
    await act(async () => fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '50' } }));
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({ target: { entity_id: ['media_player.living_room'] }, service_data: { volume_level: 0.5 } })
    );
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({ target: { entity_id: ['media_player.gym'] }, service_data: { volume_level: 1 } })
    );
  });
});

describe('Direct seek gestures', () => {
  it('jumps to the tapped position once on release', async () => {
    mountCard();
    const slider = screen.getByRole('slider', { name: 'Track position' });
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 216 } as DOMRect);
    fireEvent.pointerDown(slider, { clientX: 158, clientY: 20, button: 0 });
    expect(sendMessagePromise).not.toHaveBeenCalled();
    await act(async () => fireEvent.pointerUp(slider, { clientX: 158, clientY: 20 }));
    expect(sendMessagePromise).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ service: 'media_seek', service_data: { seek_position: 150 } })
    );
  });
  it.each(['vertical', 'cancel', 'blur'])('does not seek after %s interrupts a gesture', async reason => {
    mountCard();
    const slider = screen.getByRole('slider', { name: 'Track position' });
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 216 } as DOMRect);
    fireEvent.pointerDown(slider, { clientX: 108, clientY: 20, button: 0 });
    if (reason === 'vertical') fireEvent.pointerMove(slider, { clientX: 110, clientY: 70 });
    if (reason === 'cancel') fireEvent.pointerCancel(slider);
    if (reason === 'blur') fireEvent.blur(slider);
    await act(async () => fireEvent.pointerUp(slider, { clientX: 110, clientY: 70 }));
    expect(sendMessagePromise).not.toHaveBeenCalled();
    expect((slider as HTMLInputElement).value).toBe('40');
  });
});

describe('Speaker favourites', () => {
  function idle() {
    for (const room of ['living_room', 'gym', 'bathroom', 'bedroom']) updateEntity('media_player.' + room, { state: 'idle' });
  }
  function favourites(count = 7) {
    const items = Array.from({ length: count }, (_, i) => ({
      title: 'Playlist ' + (i + 1),
      media_content_id: 'FV:' + i,
      media_content_type: 'favorite_item_id',
      can_play: true,
      thumbnail: '/art.jpg',
    }));
    browseMedia.mockImplementation(async message =>
      message.media_content_type === 'favorites'
        ? { children: [{ title: 'Playlists', media_content_type: 'playlists', media_content_id: 'folder', can_expand: true }] }
        : { children: items }
    );
  }
  it('keeps idle favourites behind the picker in Quiet Home while preserving playback', async () => {
    idle();
    favourites();
    mountCard(true);
    expect(screen.queryByRole('button', { name: 'Play Playlist 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }));
    expect(await within(screen.getByRole('dialog', { name: 'Favourites' })).findByRole('button', { name: 'Play Playlist 1' })).toBeTruthy();
    expect(sendMessagePromise).not.toHaveBeenCalled();
  });
  it('shows favourites for a paused Spotify connection without track details', async () => {
    idle();
    favourites();
    updateEntity(
      'media_player.living_room',
      { state: 'paused' },
      {
        media_title: undefined,
        media_playlist: undefined,
        media_artist: undefined,
        media_duration: undefined,
        media_content_id: 'x-sonos-vli:spotify:session',
        source: 'Spotify Connect',
        entity_picture: undefined,
      }
    );
    mountCard();
    expect(await screen.findByRole('button', { name: 'Play Playlist 1' })).toBeTruthy();
    expect(screen.getByText('Ready to play')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Track position' })).toBeNull();
  });
  it('keeps Resume for a titled paused track without artwork', () => {
    idle();
    updateEntity('media_player.living_room', { state: 'paused' }, { entity_picture: undefined });
    mountCard();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.getByText('Test track')).toBeTruthy();
    expect(screen.queryByText('Ready to play')).toBeNull();
  });
  it('shows nested favourites while idle and hides stale track art and transport', async () => {
    idle();
    favourites();
    updateEntity('media_player.living_room', {}, { entity_picture: '/stale.jpg' });
    mountCard();
    expect(await screen.findByRole('button', { name: 'Play Playlist 7' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next track' })).toBeNull();
    expect(document.querySelector('.speaker-artwork')).toBeNull();
  });
  it('removes the idle grid when a single speaker starts playing', async () => {
    idle();
    favourites();
    updateEntity('media_player.living_room', {}, { group_members: ['media_player.living_room'] });
    mountCard();
    await screen.findByRole('button', { name: 'Play Playlist 1' });
    updateEntity(
      'media_player.living_room',
      { state: 'playing' },
      { media_title: 'Started', entity_picture: '/new.jpg', media_content_id: 'new' }
    );
    expect(screen.queryByRole('button', { name: 'Play Playlist 1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });
  it('hides the favourites button when the whole collection is already visible', async () => {
    idle();
    favourites();
    mountCard();
    await screen.findByRole('button', { name: 'Play Playlist 7' });
    expect(screen.queryByRole('button', { name: 'Favourites' })).toBeNull();
    updateEntity('media_player.living_room', { state: 'playing' });
    expect(screen.getByRole('button', { name: 'Favourites' })).toBeTruthy();
  });
  it('limits the idle grid to twelve and offers all favourites in a sheet', async () => {
    idle();
    favourites(13);
    mountCard();
    await screen.findByRole('button', { name: 'Play Playlist 12' });
    expect(screen.getByRole('button', { name: 'Favourites' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play Playlist 13' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'See all 13' }));
    expect(
      await within(screen.getByRole('dialog', { name: 'Favourites' })).findByRole('button', { name: 'Play Playlist 13' })
    ).toBeTruthy();
  });
  it('keeps favourites accessible during playback and sends the specific selection only to the source', async () => {
    favourites();
    mountCard();
    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play Playlist 2' }));
    expect(sendMessagePromise).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'play_media',
        target: { entity_id: ['media_player.living_room'] },
        service_data: { media_content_id: 'FV:1', media_content_type: 'favorite_item_id' },
      })
    );
    expect(screen.getByRole('dialog', { name: 'Favourites' })).toBeTruthy();
    updateEntity('media_player.living_room', { state: 'playing' }, { media_title: 'New song', media_content_id: 'new-song' });
    await act(async () => {});
    expect(screen.queryByRole('dialog', { name: 'Favourites' })).toBeNull();
  });
  it('uses a quiet fallback when favourites are empty and allows retry after a library failure', async () => {
    idle();
    browseMedia.mockRejectedValueOnce(new Error('Offline'));
    mountCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry favourites' }));
    expect(await screen.findByText('Choose this speaker in your music app.')).toBeTruthy();
  });
  it('blocks repeated playlist starts and keeps the sheet open if only volume changes', async () => {
    favourites();
    mountCard();
    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }));
    const tile = await screen.findByRole('button', { name: 'Play Playlist 1' });
    fireEvent.click(tile);
    fireEvent.click(tile);
    await act(async () => {});
    updateEntity('media_player.living_room', {}, { volume_level: 0.5 });
    expect(sendMessagePromise).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Favourites' })).toBeTruthy();
    expect(tile.hasAttribute('disabled')).toBe(true);
  });
  it('reports an unconfirmed start and re-enables the favourites', async () => {
    favourites();
    mountCard();
    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }));
    const tile = await screen.findByRole('button', { name: 'Play Playlist 1' });
    vi.useFakeTimers();
    fireEvent.click(tile);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(screen.getByRole('alert').textContent).toContain('Playback could not be confirmed');
    expect(tile.hasAttribute('disabled')).toBe(false);
  });
  it('shows a failed playlist start without losing the choices', async () => {
    idle();
    favourites();
    sendMessagePromise.mockRejectedValueOnce(new Error('Speaker offline'));
    mountCard();
    fireEvent.click(await screen.findByRole('button', { name: 'Play Playlist 1' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play Playlist 2' }).hasAttribute('disabled')).toBe(false);
  });
});

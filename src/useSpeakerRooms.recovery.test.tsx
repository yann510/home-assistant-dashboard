// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStore } from '@hakit/core';
import { useSpeakerRooms } from './useSpeakerRooms';
import type { Connection, HassEntities } from 'home-assistant-js-websocket';
afterEach(cleanup);
it('source change during a pending join releases the spinner', async () => {
  const send = vi.fn(() => new Promise(() => {}));
  const entity = (room: string) => ({entity_id: `media_player.${room}`, state:'idle', attributes:{group_members:[`media_player.${room}`]}});
  useStore.setState({connection:{connected:true,sendMessagePromise:send,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as Connection,connectionStatus:'connected',entities:{'media_player.living_room':entity('living_room'),'media_player.gym':entity('gym'),'media_player.bathroom':entity('bathroom')} as unknown as HassEntities});
  const {result,rerender} = renderHook(({source}) => useSpeakerRooms({source,members:[source],disabled:false}),{initialProps:{source:'media_player.living_room' as 'media_player.living_room' | 'media_player.bathroom'}});
  act(() => {void result.current.toggleRoom('media_player.gym');});
  expect(result.current.busy).toBe(true);
  await act(async () => {rerender({source:'media_player.bathroom'});});
  expect(result.current.pending.current).toBe(false);
  expect(result.current.busy).toBe(false);
  expect(result.current.busyRoom).toBeNull();
});

it('an old completion cannot release a newer source operation', async () => {
  let resolveOld!: (value: unknown) => void;
  const oldRequest = new Promise(resolve => { resolveOld = resolve; });
  const send = vi.fn().mockReturnValueOnce(oldRequest).mockImplementation(() => new Promise(() => {}));
  const entity = (room: string) => ({entity_id: `media_player.${room}`, state:'idle', attributes:{group_members:[`media_player.${room}`]}});
  useStore.setState({connection:{connected:true,sendMessagePromise:send,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as Connection,connectionStatus:'connected',entities:{'media_player.living_room':entity('living_room'),'media_player.gym':entity('gym'),'media_player.bathroom':entity('bathroom')} as unknown as HassEntities});
  const {result,rerender} = renderHook(({source}) => useSpeakerRooms({source,members:[source],disabled:false}),{initialProps:{source:'media_player.living_room' as 'media_player.living_room' | 'media_player.bathroom'}});
  act(() => {void result.current.toggleRoom('media_player.gym');});
  await act(async () => {rerender({source:'media_player.bathroom'});});
  act(() => {void result.current.toggleRoom('media_player.gym');});
  expect(result.current.busy).toBe(true);
  await act(async () => resolveOld({}));
  expect(result.current.busy).toBe(true);
  expect(result.current.pending.current).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
});

it('releases only its own pinned source after interrupted removal', async () => {
  let resolveOld!: (value: unknown) => void;
  const oldRequest = new Promise(resolve => { resolveOld = resolve; });
  const send = vi.fn().mockReturnValueOnce(oldRequest).mockImplementation(() => new Promise(() => {}));
  const pinSource = vi.fn();
  const onSourceChanged = vi.fn();
  const entity = (room: string, group: string[]) => ({ entity_id: `media_player.${room}`, state: 'playing', attributes: { group_members: group.map(id => `media_player.${id}`) } });
  const connection = { connected: true, sendMessagePromise: send, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as Connection;
  useStore.setState({ connection, connectionStatus: 'connected', entities: {
    'media_player.living_room': entity('living_room', ['living_room', 'gym']),
    'media_player.gym': entity('gym', ['living_room', 'gym']),
    'media_player.bathroom': entity('bathroom', ['bathroom']),
  } as unknown as HassEntities });
  const { result, rerender } = renderHook(({source}) => useSpeakerRooms({source,members:[source],disabled:false,pinSource,onSourceChanged}), {initialProps:{source:'media_player.living_room' as 'media_player.living_room' | 'media_player.gym'}});
  act(() => { void result.current.toggleRoom('media_player.living_room'); });
  expect(pinSource).toHaveBeenLastCalledWith('media_player.living_room');
  act(() => { useStore.setState({connectionStatus:'disconnected'}); });
  expect(pinSource).toHaveBeenLastCalledWith(null);
  act(() => { useStore.setState({connectionStatus:'connected',entities:{
    ...useStore.getState().entities,
    'media_player.living_room': entity('living_room', ['living_room']),
    'media_player.gym': entity('gym', ['gym', 'bathroom']),
    'media_player.bathroom': entity('bathroom', ['gym', 'bathroom']),
  } as unknown as HassEntities}); });
  await act(async () => { rerender({source:'media_player.gym'}); });
  act(() => { void result.current.toggleRoom('media_player.gym'); });
  expect(pinSource).toHaveBeenLastCalledWith('media_player.gym');
  await act(async () => resolveOld({}));
  expect(pinSource).toHaveBeenLastCalledWith('media_player.gym');
  expect(result.current.pending.current).toBe(true);
});

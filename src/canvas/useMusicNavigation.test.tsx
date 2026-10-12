// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useMusicNavigation } from './useMusicNavigation';

const liked = { title: 'Liked songs', media_content_id: 'spotify://saved', media_content_type: 'music', can_expand: true };
it('restores collection scroll through speaker history and discards scroll on a different source lifetime', () => {
  const connection = {};
  const { result, rerender } = renderHook(({ source }) => useMusicNavigation(source), { initialProps: { source: { entityId: 'room', connection, connected: true } } });
  act(() => result.current.openFolder(liked, 240));
  act(() => result.current.openSpeakers(128));
  act(() => result.current.back(0));
  expect(result.current.current.folders).toEqual([liked]);
  expect(result.current.current.scroll).toBe(128);
  act(() => result.current.back(128));
  expect(result.current.current.scroll).toBe(240);
  rerender({ source: { entityId: 'new_room', connection, connected: true } });
  expect(result.current.current.scroll).toBe(0);
  act(() => result.current.forward(0));
  expect(result.current.current.scroll).toBe(0);
  expect(result.current.current.folders).toEqual([liked]);
});
it('does not add duplicate speaker entries and returns to the previous search', () => {
  const { result } = renderHook(() => useMusicNavigation({ entityId: 'room', connection: null, connected: true }));
  act(() => result.current.search('dreams', 0));
  act(() => result.current.openSpeakers(80));
  act(() => result.current.openSpeakers(0));
  act(() => result.current.back(0));
  expect(result.current.current.query).toBe('dreams');
  expect(result.current.current.speakers).toBe(false);
});

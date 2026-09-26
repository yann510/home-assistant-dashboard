// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasBlinds } from './CanvasBlinds';
import { createHaFixture, deferred } from './testing/haFixture';

const ref = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign((select: (state: unknown) => unknown) => ref.current!.useStore(select), {
    getState: () => ref.current!.getState(),
    subscribe: (listener: () => void) => ref.current!.subscribe(listener),
  }),
}));
beforeEach(() => { ref.current = createHaFixture(); });
afterEach(cleanup);

function mountCompact() {
  return render(<div className='canvas'><div className='canvas__shortcuts'><CanvasBlinds /></div></div>);
}

it('keeps routine pending and accepted feedback in the compact action without an issue row', async () => {
  const response = deferred();
  ref.current!.respondWith(() => response.promise);
  mountCompact();
  fireEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  const open = screen.getByRole('button', { name: 'Open selected blinds' });
  expect(open.getAttribute('aria-busy')).toBe('true');
  expect(open.textContent).toContain('Sending…');
  expect(screen.getByRole('group', { name: 'Open blind command results' }).getAttribute('data-has-issue')).toBe('false');
  await act(async () => response.resolve({}));
  expect(screen.getByRole('group', { name: 'Open blind command results' }).getAttribute('data-has-issue')).toBe('false');
  expect(screen.queryByText(/Stop targets/)).toBeNull();
});

it('marks a failed compact command as an issue and shows Stop scope after selection changes', async () => {
  const response = deferred();
  ref.current!.respondWith(() => response.promise);
  mountCompact();
  fireEvent.click(screen.getByRole('button', { name: 'Open selected blinds' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gym blinds' }));
  expect(screen.getByText(/Stop targets Living room \+ Bedroom \+ Gym/)).toBeTruthy();
  await act(async () => response.reject(new Error('Assistant unavailable')));
  const feedback = screen.getByRole('group', { name: 'Open blind command results' });
  expect(feedback.getAttribute('data-has-issue')).toBe('true');
  expect(screen.getAllByRole('alert')).toHaveLength(3);
  expect(screen.getAllByRole('alert')[0].textContent).toContain('Assistant unavailable');
});

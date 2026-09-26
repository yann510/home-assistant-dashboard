// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasDashboard } from './CanvasDashboard';
import { createHaFixture } from './testing/haFixture';
import { DashboardViews } from '../DashboardViews';

const fixtureRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign((select: (state: unknown) => unknown) => fixtureRef.current!.useStore(select), {
    getState: () => fixtureRef.current!.getState(),
    subscribe: (listener: (state: unknown) => void) => fixtureRef.current!.subscribe(() => listener(fixtureRef.current!.getState())),
  }),
  useEntity: (id: string) => fixtureRef.current!.useStore(state => state.entities[id] ?? null),
  useHass: () => ({ joinHassUrl: (path: string) => path }),
  useIcon: () => null,
}));
const fixture = createHaFixture();
fixtureRef.current = fixture;

afterEach(() => {
  cleanup();
  fixture.reset();
});

it.each(['', 'classic', 'quiet', 'canvas', 'unknown'])('always renders Canvas for view=%s without switching controls', view => {
  history.replaceState(null, '', view ? `/?view=${view}&keep=1` : '/?keep=1');
  render(<DashboardViews />);
  expect(screen.getByRole('heading', { name: /Make yourself at home/ })).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Dashboard view' })).toBeNull();
  expect(fixture.calls).toHaveLength(0);
  history.replaceState(null, '', '/');
});

it('mounts and reconnects without sending service calls', () => {
  render(<CanvasDashboard />);
  expect(screen.getByRole('heading', { name: /Make yourself at home/ })).toBeTruthy();
  expect(fixture.calls).toHaveLength(0);
  act(() => fixture.disconnect());
  expect(screen.getByText(/Disconnected/)).toBeTruthy();
  act(() => fixture.reconnect());
  expect(fixture.calls).toHaveLength(0);
});

it('uses one dialog and returns from a detail route to the device directory', () => {
  render(<CanvasDashboard />);
  fireEvent.click(screen.getByRole('button', { name: 'All devices' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Speakers' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('dialog', { name: 'Speakers' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('dialog', { name: 'All devices' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'All devices' }));
});

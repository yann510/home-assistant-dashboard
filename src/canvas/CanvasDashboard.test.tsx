// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasDashboard } from './CanvasDashboard';
import { createHaFixture } from './testing/haFixture';
import { DashboardViews } from '../DashboardViews';

const fixtureRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({ useStore: (select: (state: unknown) => unknown) => fixtureRef.current!.useStore(select) }));
vi.mock('../Dashboard', () => ({ default: () => <div>Classic dashboard</div> }));
vi.mock('../QuietHome', () => ({ QuietHome: () => <div>Quiet dashboard</div> }));
const fixture = createHaFixture();
fixtureRef.current = fixture;

afterEach(() => {
  cleanup();
  fixture.reconnect();
});

it('routes Classic by default, Quiet and Canvas by URL, and unknown views to Classic', () => {
  history.replaceState(null, '', '/?keep=1');
  const view = render(<DashboardViews />);
  expect(screen.getByText('Classic dashboard')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Canvas' }).getAttribute('href')).toContain('keep=1');
  view.unmount();
  history.replaceState(null, '', '/?view=quiet&keep=1');
  const quiet = render(<DashboardViews />);
  expect(screen.getByText('Quiet dashboard')).toBeTruthy();
  quiet.unmount();
  history.replaceState(null, '', '/?view=canvas&keep=1');
  const canvas = render(<DashboardViews />);
  expect(screen.getByRole('heading', { name: /Make yourself at home/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Classic' }).getAttribute('href')).toContain('keep=1');
  canvas.unmount();
  history.replaceState(null, '', '/?view=unknown');
  render(<DashboardViews />);
  expect(screen.getByText('Classic dashboard')).toBeTruthy();
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
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Weather' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('dialog', { name: 'Weather' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('dialog', { name: 'All devices' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'All devices' }));
});

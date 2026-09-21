// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QuietHome } from './QuietHome';
import { DashboardViews } from './DashboardViews';
import type { AttentionItem } from './attention';
const ha = vi.hoisted(() => ({ connected: true }));
vi.mock('@hakit/core', () => ({
  useStore: (select: (s: unknown) => unknown) =>
    select({ connection: { connected: ha.connected }, connectionStatus: ha.connected ? 'connected' : 'disconnected', entities: {} }),
  useIcon: () => null,
}));
vi.mock('./useHouseMood', () => ({
  useHouseMood: () => ({
    status: { phase: 'idle', activeMood: null, pendingMood: null, errors: [] },
    connected: ha.connected,
    available: true,
  }),
}));
vi.mock('./QuietMoodCard', () => ({
  QuietMoodCard: ({ onOpen }: { onOpen: () => void }) => <button onClick={onOpen}>Choose a mood</button>,
}));
vi.mock('./QuietWeather', () => ({
  QuietWeather: ({ onOpen }: { onOpen: () => void }) => <button onClick={onOpen}>Outdoor weather</button>,
  QuietForecast: () => <div>Live forecast</div>,
}));
vi.mock('./HouseMoodCard', () => ({ HouseMoodCard: () => <div>Mood presets</div> }));
vi.mock('./useLightSummary', () => ({ useLightSummary: () => '2 lights on' }));
vi.mock('./QuietRoomControls', () => ({
  QuietRoomControls: ({ kind }: { kind: string }) => <div>{kind} room controls</div>,
  useLightSummary: () => '2 lights on',
}));
vi.mock('./SpeakerCard', () => ({ SpeakerCard: () => <div>Music player</div> }));
vi.mock('./HomeModeControls', () => ({ HomeModeControls: () => <div>Home modes</div> }));
vi.mock('./TemperatureCard', () => ({ TemperatureCard: () => <div>Thermostat controls</div> }));
vi.mock('./AppliancesCard', () => ({ AppliancesCard: () => <div>Appliance controls</div> }));
vi.mock('@hakit/components', () => ({ VacuumCard: () => <div>Vacuum controls</div> }));
vi.mock('./Dashboard', () => ({ default: () => <div>Classic dashboard</div> }));
const reminder = {
  id: 'climate',
  episode: '1',
  title: 'Heating needs attention',
  detail: 'Check thermostat',
  target: 'temperature',
  kind: 'condition',
  occurred_at: new Date().toISOString(),
  tone: 'amber',
  icon: 'heat',
} as AttentionItem;
vi.mock('./AttentionPanel', () => ({
  AttentionPanel: ({ onView }: { onView: (item: AttentionItem) => void }) => (
    <button onClick={() => onView(reminder)}>View heating reminder</button>
  ),
}));
vi.mock('./RunningPanel', () => ({
  RunningPanel: ({ onNavigate }: { onNavigate: (target: string) => void }) => (
    <button onClick={() => onNavigate('appliances-card')}>Running washer</button>
  ),
}));
afterEach(() => {
  cleanup();
  ha.connected = true;
  history.replaceState(null, '', '/');
});
it('keeps everyday controls visible and opens only the requested secondary panel', () => {
  render(<QuietHome />);
  expect(screen.getByText('Music player')).toBeTruthy();
  expect(screen.queryByText('Thermostat controls')).toBeNull();
  expect(screen.queryByText('Appliance controls')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Lights by room/ }));
  expect(screen.getByText('lights room controls')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Blinds by room/ }));
  expect(screen.queryByText('lights room controls')).toBeNull();
  expect(screen.getByText('blinds room controls')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  expect(screen.queryByText('blinds room controls')).toBeNull();
});
it('opens the full forecast and keeps thermostat under All controls', () => {
  render(<QuietHome />);
  fireEvent.click(screen.getByRole('button', { name: 'Outdoor weather' }));
  expect(screen.getByText('Live forecast')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'All controls' }));
  fireEvent.click(screen.getByRole('button', { name: 'Thermostat' }));
  expect(screen.getByText('Thermostat controls')).toBeTruthy();
});
it('routes reminders and running devices into the corresponding hidden controls', () => {
  render(<QuietHome />);
  fireEvent.click(screen.getByRole('button', { name: 'View heating reminder' }));
  expect(screen.getByText('Thermostat controls')).toBeTruthy();
  expect(screen.getByText('Heating needs attention')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Running washer' }));
  expect(screen.getByText('Appliance controls')).toBeTruthy();
  expect(screen.queryByText('Heating needs attention')).toBeNull();
});
it('does not render live room commands while disconnected', () => {
  ha.connected = false;
  render(<QuietHome />);
  fireEvent.click(screen.getByRole('button', { name: /Blinds by room/ }));
  expect(screen.queryByText('blinds room controls')).toBeNull();
  expect(screen.getByText(/Reconnect to control/)).toBeTruthy();
});
it('defaults to Classic, opts into Quiet Home by URL, and offers the original view', () => {
  const view = render(<DashboardViews />);
  expect(screen.getByText('Classic dashboard')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Quiet Home' }).getAttribute('href')).toContain('view=quiet');
  view.unmount();
  history.replaceState(null, '', '/?view=quiet&keep=1');
  render(<DashboardViews />);
  expect(screen.queryByText('Classic dashboard')).toBeNull();
  expect(screen.getByText('Music player')).toBeTruthy();
  const classic = screen.getByRole('link', { name: 'Classic' }).getAttribute('href');
  expect(classic).toContain('keep=1');
  expect(classic).not.toContain('view=quiet');
});

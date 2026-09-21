// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QuietWeather, QuietForecast } from './QuietWeather';
const ha = vi.hoisted(() => ({
  connected: true,
  weather: { state: 'sunny', attributes: { temperature: 0, temperature_unit: '°C', supported_features: 3 } } as {
    state: string;
    attributes: Record<string, unknown>;
  } | null,
  subscribe: vi.fn(),
}));
const connection = { connected: true, subscribeMessage: ha.subscribe };
vi.mock('@hakit/core', () => ({
  useIcon: () => null,
  useStore: (select: (s: unknown) => unknown) =>
    select({
      connection,
      connectionStatus: ha.connected ? 'connected' : 'disconnected',
      entities: { 'weather.forecast_home': ha.weather },
    }),
}));
let receive: (event: unknown) => void;
let unsubscribe: ReturnType<typeof vi.fn<() => Promise<void>>>;
beforeEach(() => {
  unsubscribe = vi.fn().mockResolvedValue(undefined);
  ha.subscribe.mockImplementation((callback: (event: unknown) => void) => {
    receive = callback;
    return Promise.resolve(unsubscribe);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  ha.connected = true;
  ha.weather = { state: 'sunny', attributes: { temperature: 0, temperature_unit: '°C', supported_features: 3 } };
  ha.subscribe.mockReset();
});
it('shows a real zero-degree temperature and opens details without issuing a forecast request', () => {
  const open = vi.fn();
  render(<QuietWeather onOpen={open} />);
  expect(screen.getByText('0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Full forecast/ }));
  expect(open).toHaveBeenCalledOnce();
  expect(ha.subscribe).not.toHaveBeenCalled();
});
it('subscribes only to a supported forecast type and renders incoming forecast values including zero lows', async () => {
  render(<QuietForecast />);
  await waitFor(() => expect(ha.subscribe).toHaveBeenCalledOnce());
  expect(ha.subscribe.mock.calls[0][1]).toEqual({
    type: 'weather/subscribe_forecast',
    entity_id: 'weather.forecast_home',
    forecast_type: 'daily',
  });
  act(() =>
    receive({
      forecast: [{ datetime: '2026-09-21T12:00:00Z', temperature: 8, templow: 0, precipitation_probability: 0, condition: 'cloudy' }],
    })
  );
  expect(screen.getByText('8°C')).toBeTruthy();
  expect(screen.getByText('Low 0°C')).toBeTruthy();
  expect(screen.getByText('Rain 0%')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
  await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  expect(screen.queryByText('8°C')).toBeNull();
  expect(ha.subscribe.mock.calls[1][1].forecast_type).toBe('hourly');
});
it('surfaces a subscription failure and allows retry', async () => {
  ha.subscribe.mockRejectedValueOnce(new Error('Unavailable'));
  render(<QuietForecast />);
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry forecast' }));
  await waitFor(() => expect(ha.subscribe).toHaveBeenCalledTimes(2));
  act(() => receive({ forecast: [] }));
  expect(screen.getByText(/No forecast entries/)).toBeTruthy();
});
it('does not expose cached temperatures or request forecasts when disconnected', () => {
  ha.connected = false;
  render(
    <>
      <QuietWeather onOpen={() => {}} />
      <QuietForecast />
    </>
  );
  expect(screen.queryByText('0')).toBeNull();
  expect(screen.queryByText('0°C')).toBeNull();
  expect(ha.subscribe).not.toHaveBeenCalled();
  expect(screen.getAllByText(/Reconnecting/).length).toBeGreaterThan(0);
});
it('does not request unsupported forecast types', () => {
  ha.weather!.attributes.supported_features = 0;
  render(<QuietForecast />);
  expect(screen.getByText(/does not provide forecasts/)).toBeTruthy();
  expect(ha.subscribe).not.toHaveBeenCalled();
});
it('unsubscribes even if the subscription finishes after its panel closes', async () => {
  let finish!: (unsubscribe: () => Promise<void>) => void;
  ha.subscribe.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const view = render(<QuietForecast />);
  view.unmount();
  await act(async () => finish(unsubscribe));
  expect(unsubscribe).toHaveBeenCalledOnce();
});
it('shows unavailable state for a missing weather entity', () => {
  ha.weather = null;
  render(<QuietWeather onOpen={() => {}} />);
  expect(screen.getByText('Weather unavailable')).toBeTruthy();
});
it('clears the previous subscription data across a disconnect and reconnect', async () => {
  const view = render(<QuietForecast />);
  act(() => receive({ forecast: [{ datetime: '2026-09-21T12:00:00Z', temperature: 8 }] }));
  expect(screen.getByText('8°C')).toBeTruthy();
  ha.connected = false;
  view.rerender(<QuietForecast />);
  expect(screen.queryByText('8°C')).toBeNull();
  ha.connected = true;
  view.rerender(<QuietForecast />);
  expect(screen.queryByText('8°C')).toBeNull();
  expect(screen.getByText('Loading forecast…')).toBeTruthy();
});
it('offers retry if an accepted subscription never delivers a forecast', async () => {
  vi.useFakeTimers();
  render(<QuietForecast />);
  await act(() => vi.advanceTimersByTimeAsync(15000));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry forecast' })).toBeTruthy();
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasWeather, CanvasWeatherNow } from './CanvasWeather';

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
  useStore: (select: (state: unknown) => unknown) =>
    select({
      connection,
      connectionStatus: ha.connected ? 'connected' : 'disconnected',
      config: { time_zone: 'America/Toronto', unit_system: { temperature: '°C' } },
      entities: { 'weather.forecast_home': ha.weather },
    }),
}));
let receive: (event: unknown) => void;
let stop: ReturnType<typeof vi.fn<() => Promise<void>>>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
  stop = vi.fn().mockResolvedValue(undefined);
  ha.subscribe.mockImplementation((callback: (event: unknown) => void) => {
    receive = callback;
    return Promise.resolve(stop);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  ha.connected = true;
  ha.weather = { state: 'sunny', attributes: { temperature: 0, temperature_unit: '°C', supported_features: 3 } };
  ha.subscribe.mockReset();
});

it('shows the reported current zero temperature without subscribing before detail opens', () => {
  const open = vi.fn();
  render(<CanvasWeatherNow onOpen={open} />);
  expect(screen.getByRole('button', { name: /Weather.*0°C.*Sunny/i })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Weather.*0°C.*Sunny/i }));
  expect(open).toHaveBeenCalledOnce();
  expect(ha.subscribe).not.toHaveBeenCalled();
});

it('renders a chronological 12-hour list, 24-hour option and separate daily columns', async () => {
  render(<CanvasWeather />);
  expect(ha.subscribe.mock.calls[0][1].forecast_type).toBe('hourly');
  act(() =>
    receive({
      forecast: Array.from({ length: 25 }, (_, i) => ({
        datetime: new Date(Date.parse('2026-09-23T18:00:00Z') + i * 3_600_000).toISOString(),
        temperature: i,
        condition: 'cloudy',
      })),
    })
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(12);
  expect(screen.getByText(/Thursday, September 24/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next 24 hours' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(24);
  fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
  expect(ha.subscribe.mock.calls[1][1].forecast_type).toBe('daily');
  act(() =>
    receive({
      forecast: [{ datetime: '2026-09-24T12:00:00Z', temperature: 8, templow: 0, precipitation_probability: 0, condition: 'rainy' }],
    })
  );
  const row = screen.getByRole('listitem');
  expect(within(row).getByText('8°C')).toBeTruthy();
  expect(within(row).getByText('Low 0°C')).toBeTruthy();
  expect(within(row).getByText('0%')).toBeTruthy();
  expect(
    row.querySelectorAll('.forecast-row__date, .forecast-row__condition, .forecast-row__temperature, .forecast-row__precipitation')
  ).toHaveLength(4);
  await act(async () => {});
  expect(stop).toHaveBeenCalledOnce();
});

it('explains unsupported hourly and retains the available daily view', () => {
  ha.weather!.attributes.supported_features = 1;
  render(<CanvasWeather />);
  expect(screen.getByText(/Hourly forecasts are unavailable/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Daily' })).toBeTruthy();
  expect(ha.subscribe.mock.calls[0][1].forecast_type).toBe('daily');
});

it('falls back to twice daily and omits an elapsed morning segment from the same local date', () => {
  vi.setSystemTime(new Date('2026-09-23T16:00:00Z'));
  ha.weather!.attributes.supported_features = 4;
  render(<CanvasWeather />);
  expect(screen.getByText(/Hourly forecasts are unavailable/)).toBeTruthy();
  expect(ha.subscribe.mock.calls[0][1].forecast_type).toBe('twice_daily');
  act(() =>
    receive({
      forecast: [
        { datetime: '2026-09-23T12:00:00Z', temperature: 9, is_daytime: true },
        { datetime: '2026-09-23T22:00:00Z', temperature: 5, is_daytime: false },
      ],
    })
  );
  expect(screen.queryByText('9°C')).toBeNull();
  expect(screen.getByText('5°C')).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
});

it('keeps a whole-day forecast for the current local date', () => {
  vi.setSystemTime(new Date('2026-09-23T16:00:00Z'));
  ha.weather!.attributes.supported_features = 1;
  render(<CanvasWeather />);
  act(() => receive({ forecast: [{ datetime: '2026-09-23T12:00:00Z', temperature: 9 }] }));
  expect(screen.getByText('9°C')).toBeTruthy();
});

it('keeps missing readings unavailable, then retries a failed subscription', async () => {
  ha.subscribe.mockRejectedValueOnce(new Error('Provider unavailable'));
  render(<CanvasWeather />);
  await act(async () => {});
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry forecast' }));
  expect(ha.subscribe).toHaveBeenCalledTimes(2);
  act(() => receive({ forecast: [{ datetime: '2026-09-23T13:00:00Z', condition: 'fog' }] }));
  const row = screen.getByRole('listitem');
  expect(within(row).getAllByText('—')).toHaveLength(3);
  expect(within(row).getByLabelText('Wind unavailable')).toBeTruthy();
  expect(within(row).queryByText('0°C')).toBeNull();
});

it('ignores old callbacks and releases a subscription that resolves after unmount', async () => {
  let finish!: (stop: () => Promise<void>) => void;
  ha.subscribe.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const view = render(<CanvasWeather />);
  view.unmount();
  await act(async () => finish(stop));
  expect(stop).toHaveBeenCalledOnce();
});

it('does not let a late hourly event replace the daily forecast', () => {
  render(<CanvasWeather />);
  const oldReceive = receive;
  fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
  act(() => receive({ forecast: [{ datetime: '2026-09-24T12:00:00Z', temperature: 8 }] }));
  act(() => oldReceive({ forecast: [{ datetime: '2026-09-23T13:00:00Z', temperature: 99 }] }));
  expect(screen.getByText('8°C')).toBeTruthy();
  expect(screen.queryByText('99°C')).toBeNull();
});

it('shows both actual offsets when fall DST repeats a local hour', () => {
  vi.setSystemTime(new Date('2026-11-01T04:00:00Z'));
  render(<CanvasWeather />);
  act(() =>
    receive({
      forecast: [
        { datetime: '2026-11-01T05:00:00Z', temperature: 4 },
        { datetime: '2026-11-01T06:00:00Z', temperature: 3 },
      ],
    })
  );
  expect(screen.getByText(/1:00 AM GMT-4/)).toBeTruthy();
  expect(screen.getByText(/1:00 AM GMT-5/)).toBeTruthy();
});

it('shows the forecast feels-like and wind with provider units, including zero', () => {
  ha.weather!.attributes.wind_speed_unit = 'mph';
  ha.weather!.attributes.temperature_unit = '°F';
  ha.weather!.attributes.apparent_temperature = 99;
  render(<CanvasWeather />);
  act(() =>
    receive({
      forecast: [
        { datetime: '2026-09-23T13:00:00Z', temperature: 8, apparent_temperature: 0, wind_speed: 0, precipitation_probability: 0 },
        { datetime: '2026-09-23T14:00:00Z', temperature: 9, apparent_temperature: 7.5, wind_speed: 12.4, precipitation_probability: 35 },
      ],
    })
  );
  const rows = screen.getAllByRole('listitem');
  expect(within(rows[0]).getByText('Feels like 0°F').parentElement?.className).toBe('forecast-row__temperature');
  expect(within(rows[0]).getByLabelText('Wind 0 mph')).toBeTruthy();
  expect(within(rows[0]).getByLabelText('Precipitation chance: 0%')).toBeTruthy();
  expect(within(rows[1]).getByText('Feels like 7.5°F')).toBeTruthy();
  expect(within(rows[1]).getByLabelText('Wind 12.4 mph')).toBeTruthy();
  expect(within(rows[1]).getByLabelText('Precipitation chance: 35%')).toBeTruthy();
  expect(screen.queryByText(/99°F/)).toBeNull();
});

it('omits invalid optional readings and never converts precipitation amount into chance', () => {
  ha.weather!.attributes.apparent_temperature = 99;
  ha.weather!.attributes.wind_speed_unit = 'km/h';
  ha.weather!.attributes.precipitation_unit = 'mm';
  render(<CanvasWeather />);
  act(() =>
    receive({
      forecast: [
        { datetime: '2026-09-23T13:00:00Z', temperature: 8, precipitation: 0, apparent_temperature: null, wind_speed: '12' },
        { datetime: '2026-09-23T14:00:00Z', temperature: 9, precipitation: 4, apparent_temperature: NaN, wind_speed: Infinity },
      ],
    })
  );
  expect(screen.queryByText(/Feels like/)).toBeNull();
  expect(screen.queryByLabelText(/^Wind \d/)).toBeNull();
  expect(screen.queryByText('0%')).toBeNull();
  expect(screen.getByLabelText('Precipitation amount: 0 mm')).toBeTruthy();
  expect(screen.getByLabelText('Precipitation amount: 4 mm')).toBeTruthy();
  expect(screen.getByText(/[Pp]recipitation chance.*unavailable/)).toBeTruthy();
});

it('keeps wind unavailable without a provider unit and uses the configured temperature unit', () => {
  delete ha.weather!.attributes.temperature_unit;
  render(<CanvasWeather />);
  act(() =>
    receive({
      forecast: [
        { datetime: '2026-09-23T13:00:00Z', temperature: 8, apparent_temperature: 6, wind_speed: 12, precipitation_probability: 25 },
      ],
    })
  );
  expect(screen.getByText('Feels like 6°C')).toBeTruthy();
  expect(screen.queryByLabelText(/^Wind \d/)).toBeNull();
  expect(screen.queryByText(/[Pp]recipitation chance.*unavailable/)).toBeNull();
});

it('shows actual provider wind and precipitation amount with their own units', () => {
  ha.weather!.attributes.wind_speed_unit = 'km/h';
  ha.weather!.attributes.precipitation_unit = 'mm';
  render(<CanvasWeather />);
  act(() =>
    receive({
      forecast: [
        {
          datetime: '2026-09-23T13:00:00Z',
          condition: 'cloudy',
          temperature: 18.4,
          wind_speed: 11.5,
          precipitation: 0,
          humidity: 43,
          wind_bearing: 38.1,
        },
      ],
    })
  );
  const row = screen.getByRole('listitem');
  expect(screen.getByLabelText('Wind 11.5 km/h').parentElement).toBe(row);
  expect(row.querySelector('.forecast-row__details')).toBeNull();
  expect(screen.getByLabelText('Precipitation amount: 0 mm')).toBeTruthy();
  expect(screen.queryByText(/^Feels like /)).toBeNull();
  expect(screen.queryByText('0%')).toBeNull();
});

it('prefers reported chance over amount and never assumes a missing precipitation unit', () => {
  render(<CanvasWeather />);
  act(() =>
    receive({
      forecast: [
        { datetime: '2026-09-23T13:00:00Z', precipitation: 4 },
        { datetime: '2026-09-23T14:00:00Z', precipitation: 4, precipitation_probability: 0 },
      ],
    })
  );
  expect(screen.getByLabelText('Precipitation unavailable')).toBeTruthy();
  expect(screen.getByLabelText('Precipitation chance: 0%')).toBeTruthy();
  expect(screen.queryByLabelText(/Precipitation amount/)).toBeNull();
});

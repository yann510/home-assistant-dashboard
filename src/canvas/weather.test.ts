import { expect, it } from 'vitest';
import { forecastDateKey, forecastHourLabel, upcomingHours, weatherIcon } from './weather';

it('uses the Home Assistant time zone for day boundaries', () => {
  expect(forecastDateKey('2026-09-24T02:00:00Z', 'America/Toronto')).toBe('2026-09-23');
  expect(forecastDateKey('2026-09-24T04:00:00Z', 'America/Toronto')).toBe('2026-09-24');
});

it('maps the supported condition families and keeps unknown weather neutral', () => {
  expect(weatherIcon(undefined)).toBe('unknown');
  expect(weatherIcon('sunny')).toBe('sun');
  expect(weatherIcon('sunny', false)).toBe('night');
  expect(weatherIcon('clear-night')).toBe('night');
  expect(weatherIcon('partlycloudy')).toBe('partly-cloudy');
  expect(weatherIcon('partlycloudy', false)).toBe('partly-night');
  expect(weatherIcon('cloudy')).toBe('cloud');
  expect(weatherIcon('rainy')).toBe('rain');
  expect(weatherIcon('pouring')).toBe('rain');
  expect(weatherIcon('snowy')).toBe('snow');
  expect(weatherIcon('snowy-rainy')).toBe('sleet');
  expect(weatherIcon('fog')).toBe('fog');
  expect(weatherIcon('windy')).toBe('wind');
  expect(weatherIcon('windy-variant')).toBe('wind');
  expect(weatherIcon('lightning')).toBe('thunderstorm');
  expect(weatherIcon('lightning-rainy')).toBe('thunderstorm');
  expect(weatherIcon('exceptional')).toBe('unknown');
});

it('selects the next 12 or 24 available future hours without fabricating gaps', () => {
  const now = Date.parse('2026-09-23T12:30:00Z');
  const entries = [
    { datetime: '2026-09-23T12:00:00Z' },
    { datetime: 'invalid' },
    ...Array.from({ length: 30 }, (_, index) => ({ datetime: new Date(now + (index + 1) * 3_600_000).toISOString() })),
  ];
  expect(upcomingHours(entries, 12, now)).toHaveLength(12);
  expect(upcomingHours(entries, 24, now)).toHaveLength(24);
  expect(upcomingHours(entries, 12, now)[0].datetime).toBe('2026-09-23T13:30:00.000Z');
});

it('distinguishes repeated fall DST hours by their actual offsets', () => {
  const first = forecastHourLabel('2026-11-01T05:00:00Z', 'America/Toronto', true);
  const second = forecastHourLabel('2026-11-01T06:00:00Z', 'America/Toronto', true);
  expect(first).toContain('1:00');
  expect(second).toContain('1:00');
  expect(first).toContain('GMT-4');
  expect(second).toContain('GMT-5');
});

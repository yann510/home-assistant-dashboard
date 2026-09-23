import type { ForecastEntry } from '../useQuietForecast';

export type WeatherIconName =
  'sun' | 'night' | 'partly-cloudy' | 'partly-night' | 'cloud' | 'rain' | 'snow' | 'sleet' | 'fog' | 'wind' | 'thunderstorm' | 'unknown';

/** Match Home Assistant's reported condition. An absent is_daytime does not imply night. */
export function weatherIcon(condition: string | undefined, isDaytime?: boolean): WeatherIconName {
  switch (condition?.toLowerCase()) {
    case 'sunny':
      return isDaytime === false ? 'night' : 'sun';
    case 'clear-night':
      return 'night';
    case 'partlycloudy':
      return isDaytime === false ? 'partly-night' : 'partly-cloudy';
    case 'cloudy':
      return 'cloud';
    case 'rainy':
    case 'pouring':
      return 'rain';
    case 'snowy':
      return 'snow';
    case 'snowy-rainy':
      return 'sleet';
    case 'fog':
      return 'fog';
    case 'windy':
    case 'windy-variant':
      return 'wind';
    case 'lightning':
    case 'lightning-rainy':
      return 'thunderstorm';
    default:
      return 'unknown';
  }
}

export function forecastDateKey(datetime: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(datetime)
  );
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function forecastHourLabel(datetime: string, timeZone: string, showOffset = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    ...(showOffset ? { timeZoneName: 'shortOffset' as const } : {}),
  }).format(new Date(datetime));
}

export function upcomingHours(entries: ForecastEntry[], count: 12 | 24, now = Date.now()): ForecastEntry[] {
  return entries
    .filter(entry => Number.isFinite(Date.parse(entry.datetime)) && Date.parse(entry.datetime) > now)
    .sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))
    .slice(0, count);
}

export function conditionLabel(condition: string | undefined): string {
  if (!condition) return 'Conditions unavailable';
  if (condition === 'partlycloudy') return 'Partly cloudy';
  return condition.replace(/[_-]/g, ' ').replace(/^./, letter => letter.toUpperCase());
}

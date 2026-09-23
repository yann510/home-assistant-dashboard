import { useEffect, useState } from 'react';
import { useStore } from '@hakit/core';
import type { Connection } from 'home-assistant-js-websocket';

export type ForecastType = 'daily' | 'hourly' | 'twice_daily';
export type ForecastEntry = {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  apparent_temperature?: number;
  wind_speed?: number;
  precipitation?: number;
  precipitation_probability?: number;
  is_daytime?: boolean;
};
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function useQuietWeather() {
  const entity = useStore(s => s.entities['weather.forecast_home']);
  const connected = useStore(s => Boolean(s.connection?.connected && s.connectionStatus === 'connected'));
  const available = Boolean(entity && !['unknown', 'unavailable'].includes(entity.state));
  return { entity, connected, available };
}
function parseForecast(value: unknown): ForecastEntry[] {
  if (!Array.isArray(value)) throw new Error('Invalid forecast response');
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || typeof entry.datetime !== 'string' || !Number.isFinite(Date.parse(entry.datetime)))
      return [];
    return [
      {
        datetime: entry.datetime,
        condition: typeof entry.condition === 'string' ? entry.condition : undefined,
        temperature: finite(entry.temperature) ? entry.temperature : undefined,
        templow: finite(entry.templow) ? entry.templow : undefined,
        apparent_temperature: finite(entry.apparent_temperature) ? entry.apparent_temperature : undefined,
        wind_speed: finite(entry.wind_speed) ? entry.wind_speed : undefined,
        precipitation: finite(entry.precipitation) ? entry.precipitation : undefined,
        precipitation_probability: finite(entry.precipitation_probability) ? entry.precipitation_probability : undefined,
        is_daytime: typeof entry.is_daytime === 'boolean' ? entry.is_daytime : undefined,
      },
    ];
  });
}
export function useQuietForecast(requested: ForecastType) {
  const { entity, connected, available } = useQuietWeather();
  const connection = useStore(s => s.connection);
  const features = entity?.attributes.supported_features ?? 0;
  const types = (['daily', 'hourly', 'twice_daily'] as const).filter((_, index) => (features & (1 << index)) !== 0);
  const type = types.includes(requested) ? requested : types[0];
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    connection: Connection;
    type: ForecastType;
    attempt: number;
    entries: ForecastEntry[] | null;
    error: string | null;
  } | null>(null);
  const [observed, setObserved] = useState({ connection, connected, available, type, attempt });
  if (
    observed.connection !== connection ||
    observed.connected !== connected ||
    observed.available !== available ||
    observed.type !== type ||
    observed.attempt !== attempt
  ) {
    setObserved({ connection, connected, available, type, attempt });
    if (result) setResult(null);
  }
  useEffect(() => {
    if (!connected || !available || !connection || !type) return;
    let active = true;
    let unsubscribe: (() => Promise<void>) | undefined;
    const error = () => {
      if (active) setResult({ connection, type, attempt, entries: null, error: 'Forecast could not be loaded. Please try again.' });
    };
    const timer = setTimeout(error, 15000);
    connection
      .subscribeMessage<{ forecast?: unknown }>(
        event => {
          if (!active) return;
          clearTimeout(timer);
          try {
            setResult({ connection, type, attempt, entries: parseForecast(event.forecast), error: null });
          } catch {
            error();
          }
        },
        { type: 'weather/subscribe_forecast', entity_id: 'weather.forecast_home', forecast_type: type }
      )
      .then(stop => {
        if (active) unsubscribe = stop;
        else void stop().catch(() => {});
      })
      .catch(() => {
        clearTimeout(timer);
        error();
      });
    return () => {
      active = false;
      clearTimeout(timer);
      if (unsubscribe) void unsubscribe().catch(() => {});
    };
  }, [connection, connected, available, type, attempt]);
  const current =
    connected && available && result?.connection === connection && result?.type === type && result?.attempt === attempt ? result : null;
  return {
    connected,
    available,
    types,
    type,
    entries: current?.entries ?? null,
    error: current?.error ?? null,
    retry: () => setAttempt(n => n + 1),
  };
}

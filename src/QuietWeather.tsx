import { useState } from 'react';
import { finite, useQuietWeather, useQuietForecast, type ForecastType } from './useQuietForecast';
const labels: Record<ForecastType, string> = { daily: 'Daily', hourly: 'Hourly', twice_daily: 'Day / night' };
const condition = (value?: string) =>
  value
    ? (value === 'partlycloudy' ? 'partly cloudy' : value).replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase())
    : 'Conditions unavailable';
export function QuietWeather({ onOpen }: { onOpen: () => void }) {
  const { entity, connected, available } = useQuietWeather();
  const attributes = entity?.attributes;
  const temp = attributes?.temperature;
  const feels = attributes?.apparent_temperature;
  const live = connected && available;
  return (
    <button className='quiet-weather' type='button' onClick={onOpen}>
      <span className='quiet-weather-title'>Outside now</span>
      <span className='quiet-weather-temp'>
        <strong>{live && finite(temp) ? Number(temp.toFixed(1)) : '—'}</strong>
        <span>{attributes?.temperature_unit ?? ''}</span>
      </span>
      <span className='quiet-weather-condition'>
        {!connected ? 'Reconnecting to Home Assistant…' : !available ? 'Weather unavailable' : condition(entity?.state)}
      </span>
      {live && finite(feels) && (
        <span className='quiet-weather-extra'>
          Feels like {Number(feels.toFixed(1))}
          {attributes?.temperature_unit}
        </span>
      )}
      <span className='quiet-weather-link'>Full forecast ↗</span>
    </button>
  );
}
export function QuietForecast() {
  const [requested, setRequested] = useState<ForecastType>('daily');
  const forecast = useQuietForecast(requested);
  const { entity } = useQuietWeather();
  const unit = entity?.attributes.temperature_unit ?? '';
  if (!forecast.connected) return <p role='status'>Reconnecting to Home Assistant… Forecast updates are paused.</p>;
  if (!forecast.available) return <p role='status'>Weather unavailable. The forecast will return when the weather provider reconnects.</p>;
  if (!forecast.type) return <p role='status'>This weather provider does not provide forecasts.</p>;
  return (
    <>
      <div className='quiet-forecast-tabs' aria-label='Forecast period'>
        {forecast.types.map(type => (
          <button
            type='button'
            key={type}
            className='quiet-button'
            aria-pressed={forecast.type === type}
            onClick={() => setRequested(type)}
          >
            {labels[type]}
          </button>
        ))}
      </div>
      {forecast.error ? (
        <div role='alert'>
          <p>{forecast.error}</p>
          <button className='quiet-button' type='button' onClick={forecast.retry}>
            Retry forecast
          </button>
        </div>
      ) : !forecast.entries ? (
        <p role='status'>Loading forecast…</p>
      ) : !forecast.entries.length ? (
        <p role='status'>No forecast entries are available yet.</p>
      ) : (
        <ul className='quiet-forecast-list'>
          {forecast.entries.map((entry, index) => (
            <li key={`${entry.datetime}-${index}`}>
              <time dateTime={entry.datetime}>
                {new Date(entry.datetime).toLocaleString(
                  undefined,
                  forecast.type === 'hourly'
                    ? { weekday: 'short', hour: 'numeric', minute: '2-digit' }
                    : { weekday: 'short', month: 'short', day: 'numeric' }
                )}
              </time>
              {forecast.type === 'twice_daily' && typeof entry.is_daytime === 'boolean' && (
                <small>{entry.is_daytime ? 'Day' : 'Night'}</small>
              )}
              <span>{condition(entry.condition)}</span>
              <strong>{finite(entry.temperature) ? `${entry.temperature}${unit}` : 'Temperature unavailable'}</strong>
              {finite(entry.templow) && (
                <small>
                  Low {entry.templow}
                  {unit}
                </small>
              )}
              {finite(entry.precipitation_probability) && <small>Rain {entry.precipitation_probability}%</small>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

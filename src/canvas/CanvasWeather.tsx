import { useState } from 'react';
import { useStore } from '@hakit/core';
import { finite, useQuietForecast, useQuietWeather, type ForecastEntry, type ForecastType } from '../useQuietForecast';
import { conditionLabel, forecastDateKey, forecastHourLabel, upcomingHours, weatherIcon, type WeatherIconName } from './weather';
import './canvas-weather.css';

function WeatherGlyph({ condition, isDaytime }: { condition?: string; isDaytime?: boolean }) {
  const name: WeatherIconName = weatherIcon(condition, isDaytime);
  const cloud = <path d='M8 19h11a4 4 0 0 0 .2-8 6 6 0 0 0-11.5 1.3A3.4 3.4 0 0 0 8 19Z' />;
  const sun = (
    <>
      <circle cx='12' cy='12' r='4' />
      <path d='M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4' />
    </>
  );
  const icon: Record<WeatherIconName, React.ReactNode> = {
    sun,
    night: <path d='M19.5 16.5A8 8 0 0 1 8 4.5 8 8 0 1 0 19.5 16.5Z' />,
    'partly-cloudy': (
      <>
        <circle cx='8' cy='8' r='3' />
        <path d='M8 1v2M2 8h2m1-4L3.6 2.6' />
        {cloud}
      </>
    ),
    'partly-night': (
      <>
        <path d='M10 2a6 6 0 0 0 5 8 6 6 0 1 1-5-8Z' />
        {cloud}
      </>
    ),
    cloud,
    rain: (
      <>
        {cloud}
        <path d='m9 21-1 2m6-2-1 2m6-2-1 2' />
      </>
    ),
    snow: (
      <>
        {cloud}
        <path d='M9 21v3m-1.5-1.5h3M17 21v3m-1.5-1.5h3' />
      </>
    ),
    sleet: (
      <>
        {cloud}
        <path d='m9 21-1 2M17 21v3m-1.5-1.5h3' />
      </>
    ),
    fog: (
      <>
        {cloud}
        <path d='M4 21h16M6 24h12' />
      </>
    ),
    wind: <path d='M3 8h12c4 0 4-5 1-5-1.5 0-2.5 1-2.5 2M2 13h18c4 0 4 5 1 5-1.5 0-2.5-1-2.5-2M5 18h7c4 0 4 5 1 5-1.5 0-2.5-1-2.5-2' />,
    thunderstorm: (
      <>
        {cloud}
        <path d='m14 19-3 5h3l-2 4' />
      </>
    ),
    unknown: (
      <>
        <circle cx='12' cy='12' r='9' />
        <path d='M9.5 9a2.5 2.5 0 1 1 3.8 2.1c-1 .6-1.3 1-1.3 2.1m0 3.5v.3' />
      </>
    ),
  };
  return (
    <svg
      className='canvas-weather__icon'
      viewBox='0 0 28 28'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.6'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      {icon[name]}
    </svg>
  );
}

function temperature(value: unknown, unit: string): string {
  return finite(value) ? `${Number(value.toFixed(1))}${unit}` : '—';
}

export function CanvasWeatherNow({ onOpen }: { onOpen(trigger: HTMLElement): void }) {
  const { entity, connected, available } = useQuietWeather();
  const configUnit = useStore(state => state.config?.unit_system.temperature ?? '');
  const live = connected && available;
  const unit = entity?.attributes.temperature_unit ?? configUnit;
  const condition = live ? conditionLabel(entity?.state) : connected ? 'Weather unavailable' : 'Reconnecting';
  return (
    <button type='button' className='canvas-weather-now' onClick={event => onOpen(event.currentTarget)}>
      <WeatherGlyph condition={live ? entity?.state : undefined} />
      <span className='canvas-weather-now__label'>Weather</span>
      <strong>{live ? temperature(entity?.attributes.temperature, unit) : '—'}</strong>
      <span>{condition}</span>
    </button>
  );
}

function ForecastRow({
  entry,
  type,
  timeZone,
  unit,
  repeated,
  windUnit,
  precipitationUnit,
  dateHeading,
}: {
  entry: ForecastEntry;
  type: ForecastType;
  timeZone: string;
  unit: string;
  repeated: boolean;
  windUnit: string;
  precipitationUnit: string;
  dateHeading?: string;
}) {
  const date = new Date(entry.datetime);
  const chance = finite(entry.precipitation_probability);
  const amount = finite(entry.precipitation) && Boolean(precipitationUnit);
  const precipitation = chance ? `${entry.precipitation_probability}%` : amount ? `${entry.precipitation} ${precipitationUnit}` : '—';
  const wind = finite(entry.wind_speed) && windUnit ? Number(entry.wind_speed.toFixed(1)) : null;
  const label =
    type === 'hourly'
      ? forecastHourLabel(entry.datetime, timeZone, repeated)
      : new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(date);
  return (
    <li className={`forecast-row forecast-row--${type}`}>
      {dateHeading && <h3 className='forecast-row__day-heading'>{dateHeading}</h3>}
      <time className='forecast-row__date' dateTime={entry.datetime}>
        {label}
      </time>
      <span className='forecast-row__condition'>
        <WeatherGlyph condition={entry.condition} isDaytime={entry.is_daytime} />
        <span className='forecast-row__condition-label'>{conditionLabel(entry.condition)}</span>
        {type === 'twice_daily' && typeof entry.is_daytime === 'boolean' ? ` · ${entry.is_daytime ? 'Day' : 'Night'}` : ''}
      </span>
      <span className='forecast-row__temperature'>
        <strong>{temperature(entry.temperature, unit)}</strong>
        {finite(entry.templow) && <small>Low {temperature(entry.templow, unit)}</small>}
        {type === 'hourly' && finite(entry.apparent_temperature) && (
          <small className='forecast-row__feels-like'>Feels like {temperature(entry.apparent_temperature, unit)}</small>
        )}
      </span>
      {type === 'hourly' && (
        <span className='forecast-row__wind'>
          <span aria-hidden='true'>{wind ?? '—'}</span>
          <span className='canvas-weather__sr-only'>{wind === null ? 'Wind unavailable' : `Wind ${wind} ${windUnit}`}</span>
        </span>
      )}
      <span
        className='forecast-row__precipitation'
        aria-label={
          chance
            ? `Precipitation chance: ${precipitation}`
            : amount
              ? `Precipitation amount: ${precipitation}`
              : 'Precipitation unavailable'
        }
      >
        <span>{precipitation}</span>
        {(chance || amount) && <small>{chance ? 'chance' : 'amount'}</small>}
      </span>
    </li>
  );
}

export function CanvasWeather() {
  const [requested, setRequested] = useState<ForecastType>('hourly');
  const [hourCount, setHourCount] = useState<12 | 24>(12);
  const forecast = useQuietForecast(requested);
  const { entity } = useQuietWeather();
  const config = useStore(state => state.config);
  const timeZone = config?.time_zone;
  const unit = entity?.attributes.temperature_unit ?? config?.unit_system.temperature ?? '';
  const windUnit = typeof entity?.attributes.wind_speed_unit === 'string' ? entity.attributes.wind_speed_unit.trim() : '';
  const precipitationUnit = typeof entity?.attributes.precipitation_unit === 'string' ? entity.attributes.precipitation_unit.trim() : '';
  if (!forecast.connected) return <p role='status'>Reconnecting to Home Assistant… Forecast updates are paused.</p>;
  if (!forecast.available) return <p role='status'>Weather unavailable. The forecast will return when the provider reconnects.</p>;
  if (!timeZone) return <p role='status'>Waiting for Home Assistant weather configuration…</p>;
  if (!forecast.type) return <p role='status'>This weather provider does not provide forecasts.</p>;
  const unsupportedHourly = !forecast.types.includes('hourly');
  const now = new Date();
  const entries =
    forecast.entries &&
    (forecast.type === 'hourly'
      ? upcomingHours(forecast.entries, hourCount)
      : forecast.entries
          .filter(entry => {
            const timestamp = Date.parse(entry.datetime);
            if (!Number.isFinite(timestamp)) return false;
            if (forecast.type === 'twice_daily') return timestamp >= now.getTime();
            return forecastDateKey(entry.datetime, timeZone) >= forecastDateKey(now.toISOString(), timeZone);
          })
          .sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime)));
  const missingDetails =
    forecast.type === 'hourly' && entries
      ? [
          ...(!entries.some(entry => finite(entry.apparent_temperature)) ? ['Feels-like'] : []),
          ...(!entries.some(entry => finite(entry.precipitation_probability)) ? ['precipitation chance'] : []),
        ]
      : [];
  const showAmounts =
    missingDetails.includes('precipitation chance') && precipitationUnit && entries?.some(entry => finite(entry.precipitation));
  const repeatedHours = new Set<string>();
  if (entries && forecast.type === 'hourly') {
    const seen = new Set<string>();
    for (const entry of entries) {
      const key = `${forecastDateKey(entry.datetime, timeZone)} ${forecastHourLabel(entry.datetime, timeZone)}`;
      if (seen.has(key)) repeatedHours.add(key);
      seen.add(key);
    }
  }
  return (
    <section className='canvas-weather' aria-label='Forecast'>
      <p className='canvas-weather__intro'>Local forecast · {timeZone.replace(/_/g, ' ')}</p>
      {unsupportedHourly && (
        <p role='status'>Hourly forecasts are unavailable from this weather provider. Choose an available forecast below.</p>
      )}
      <div className='canvas-weather__tabs' aria-label='Forecast period'>
        {forecast.types.includes('hourly') && (
          <>
            <button
              type='button'
              aria-pressed={forecast.type === 'hourly' && hourCount === 12}
              onClick={() => {
                setRequested('hourly');
                setHourCount(12);
              }}
            >
              Next 12 hours
            </button>
            <button
              type='button'
              aria-pressed={forecast.type === 'hourly' && hourCount === 24}
              onClick={() => {
                setRequested('hourly');
                setHourCount(24);
              }}
            >
              Next 24 hours
            </button>
          </>
        )}
        {forecast.types.includes('daily') && (
          <button type='button' aria-pressed={forecast.type === 'daily'} onClick={() => setRequested('daily')}>
            Daily
          </button>
        )}
        {forecast.types.includes('twice_daily') && (
          <button type='button' aria-pressed={forecast.type === 'twice_daily'} onClick={() => setRequested('twice_daily')}>
            Day / night
          </button>
        )}
      </div>
      {forecast.error ? (
        <div role='alert'>
          <p>{forecast.error}</p>
          <button type='button' onClick={forecast.retry}>
            Retry forecast
          </button>
        </div>
      ) : !entries ? (
        <p role='status'>Loading forecast…</p>
      ) : !entries.length ? (
        <p role='status'>No upcoming forecast entries are available yet.</p>
      ) : (
        <>
          {missingDetails.length > 0 && (
            <p className='canvas-weather__availability'>
              {missingDetails.join(' and ')} unavailable{showAmounts ? '; showing amounts' : ''}.
            </p>
          )}
          <div className={`canvas-weather__column-head canvas-weather__column-head--${forecast.type}`} aria-hidden='true'>
            <span>Time</span>
            <span className='canvas-weather__condition-heading'>Conditions</span>
            <span>{forecast.type === 'hourly' ? 'Temp.' : 'Temperature'}</span>
            {forecast.type === 'hourly' && <span>Wind{windUnit && <small>{windUnit}</small>}</span>}
            <span>Precip.</span>
          </div>
          <ul className='canvas-weather__list'>
            {entries.map((entry, index) => {
              const dateKey = forecastDateKey(entry.datetime, timeZone);
              const previousDate = index ? forecastDateKey(entries[index - 1].datetime, timeZone) : null;
              const repeated = repeatedHours.has(`${dateKey} ${forecastHourLabel(entry.datetime, timeZone)}`);
              const dateHeading =
                forecast.type === 'hourly' && dateKey !== previousDate
                  ? new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(
                      new Date(entry.datetime)
                    )
                  : undefined;
              return (
                <ForecastRow
                  key={`${entry.datetime}-${index}`}
                  entry={entry}
                  type={forecast.type!}
                  timeZone={timeZone}
                  unit={unit}
                  windUnit={windUnit}
                  precipitationUnit={precipitationUnit}
                  repeated={repeated}
                  dateHeading={dateHeading}
                />
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

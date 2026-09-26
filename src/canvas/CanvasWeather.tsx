import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { CanvasDialog } from './CanvasDialog';
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

function SkyIllustration({ name }: { name: WeatherIconName }) {
  const showSun = name === 'sun' || name === 'partly-cloudy';
  const showMoon = name === 'night' || name === 'partly-night';
  const showCloud = ['partly-cloudy', 'partly-night', 'cloud', 'rain', 'snow', 'sleet', 'fog', 'thunderstorm'].includes(name);
  return (
    <svg className={`canvas-weather__art canvas-weather__art--${name}`} viewBox='0 0 240 132' aria-hidden='true' focusable='false'>
      <path className='canvas-weather__art-hill canvas-weather__art-hill--back' d='M0 110c35-22 57-28 91-12s59 15 85-3 44-14 64-2v39H0Z' />
      <path className='canvas-weather__art-hill canvas-weather__art-hill--front' d='M0 119c36-12 67-9 96 1s53 7 77-3 44-7 67 0v15H0Z' />
      {showSun && <circle className='canvas-weather__art-sun' cx='165' cy='48' r='25' />}
      {showMoon && <path className='canvas-weather__art-moon' d='M178 23a25 25 0 1 0 23 39 25 25 0 0 1-23-39Z' />}
      {showCloud && (
        <path className='canvas-weather__art-cloud' d='M49 91h92a18 18 0 0 0 0-36 27 27 0 0 0-52-3 17 17 0 0 0-40 10 15 15 0 0 0 0 29Z' />
      )}
      {name === 'rain' && <path className='canvas-weather__art-rain' d='m77 100-6 13m29-13-6 13m29-13-6 13m29-13-6 13' />}
      {name === 'snow' && (
        <g className='canvas-weather__art-snow'>
          <circle cx='77' cy='106' r='2.5' />
          <circle cx='105' cy='115' r='2.5' />
          <circle cx='132' cy='105' r='2.5' />
          <circle cx='153' cy='116' r='2.5' />
        </g>
      )}
      {name === 'sleet' && <path className='canvas-weather__art-rain' d='m82 101-5 10m35-10-5 10m35-10-5 10' />}
      {name === 'thunderstorm' && <path className='canvas-weather__art-lightning' d='m111 91-14 22h13l-6 18 25-29h-14l8-11Z' />}
      {name === 'fog' && <path className='canvas-weather__art-fog' d='M55 102h129M67 112h115' />}
      {name === 'wind' && (
        <path className='canvas-weather__art-wind' d='M70 62h82c15 0 15-17 4-17-6 0-9 4-9 8M55 75h119c14 0 14 16 3 16-6 0-9-4-9-8' />
      )}
      {name === 'unknown' && (
        <g className='canvas-weather__art-stars'>
          <path d='m153 42 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm-42 22 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z' />
        </g>
      )}
    </svg>
  );
}

function CurrentWeatherHero({
  condition,
  temperatureValue,
  unit,
  location,
  connected,
  available,
}: {
  condition?: string;
  temperatureValue: unknown;
  unit: string;
  location?: string;
  connected: boolean;
  available: boolean;
}) {
  const live = connected && available;
  const label = live ? conditionLabel(condition) : connected ? 'Weather unavailable' : 'Reconnecting';
  const icon = live ? weatherIcon(condition) : 'unknown';
  return (
    <section className={`canvas-weather__sky-window canvas-weather__sky-window--${icon}`} aria-label='Current weather'>
      <div className='canvas-weather__sky-copy'>
        <p className='canvas-weather__eyebrow'>Right now</p>
        <p className='canvas-weather__current-temperature'>{live ? temperature(temperatureValue, unit) : '—'}</p>
        <p className='canvas-weather__current-condition'>{label}</p>
        <p className='canvas-weather__location'>{location ? `Local forecast · ${location}` : 'Local forecast'}</p>
      </div>
      <SkyIllustration name={icon} />
    </section>
  );
}

export function CanvasWeatherNow({ onOpen }: { onOpen(trigger: HTMLElement): void }) {
  const { entity, connected, available } = useQuietWeather();
  const configUnit = useStore(state => state.config?.unit_system.temperature ?? '');
  const live = connected && available;
  const unit = entity?.attributes.temperature_unit ?? configUnit;
  const condition = live ? conditionLabel(entity?.state) : connected ? 'Weather unavailable' : 'Reconnecting';
  const currentTemperature = live ? temperature(entity?.attributes.temperature, unit) : '—';
  return (
    <button
      type='button'
      className='canvas-weather-now'
      aria-label={`Weather ${currentTemperature} ${condition}`}
      onClick={event => onOpen(event.currentTarget)}
    >
      <WeatherGlyph condition={live ? entity?.state : undefined} />
      <strong>{currentTemperature}</strong>
      <span className='canvas-weather-now__condition'>{condition}</span>
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
    <li className={`forecast-row forecast-row--${type}${dateHeading ? ' forecast-row--day-start' : ''}`}>
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
        {chance && <small>chance</small>}
      </span>
    </li>
  );
}

type WeatherDialogProps = Omit<ComponentProps<typeof CanvasDialog>, 'title' | 'children' | 'headerAccessory'>;

export function CanvasWeatherDialog(props: WeatherDialogProps) {
  return <CanvasWeather dialogProps={props} />;
}

export function CanvasWeather({ dialogProps }: { dialogProps?: WeatherDialogProps } = {}) {
  const [requested, setRequested] = useState<ForecastType>('hourly');
  const controlsRef = useRef<HTMLDivElement>(null);
  const focusedPeriod = useRef<string | null>(null);
  const [wide, setWide] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 701px)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(min-width: 701px)');
    const update = () => {
      const focused = document.activeElement;
      focusedPeriod.current =
        focused instanceof HTMLButtonElement && controlsRef.current?.contains(focused) ? (focused.dataset.forecastPeriod ?? null) : null;
      setWide(query.matches);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    const period = focusedPeriod.current;
    focusedPeriod.current = null;
    if (period) controlsRef.current?.querySelector<HTMLButtonElement>(`[data-forecast-period="${period}"]`)?.focus({ preventScroll: true });
  }, [wide]);
  const forecast = useQuietForecast(requested);
  const { entity } = useQuietWeather();
  const config = useStore(state => state.config);
  const timeZone = config?.time_zone;
  const forecastZone = timeZone ?? 'UTC';
  const unit = entity?.attributes.temperature_unit ?? config?.unit_system.temperature ?? '';
  const windUnit = typeof entity?.attributes.wind_speed_unit === 'string' ? entity.attributes.wind_speed_unit.trim() : '';
  const precipitationUnit = typeof entity?.attributes.precipitation_unit === 'string' ? entity.attributes.precipitation_unit.trim() : '';
  const unsupportedHourly = Boolean(forecast.type && !forecast.types.includes('hourly'));
  const now = new Date();
  const entries =
    forecast.entries &&
    (forecast.type === 'hourly'
      ? upcomingHours(forecast.entries, 12)
      : forecast.entries
          .filter(entry => {
            const timestamp = Date.parse(entry.datetime);
            if (!Number.isFinite(timestamp)) return false;
            if (forecast.type === 'twice_daily') return timestamp >= now.getTime();
            return forecastDateKey(entry.datetime, forecastZone) >= forecastDateKey(now.toISOString(), forecastZone);
          })
          .sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime)));
  const repeatedHours = new Set<string>();
  if (entries && forecast.type === 'hourly') {
    const seen = new Set<string>();
    for (const entry of entries) {
      const key = `${forecastDateKey(entry.datetime, forecastZone)} ${forecastHourLabel(entry.datetime, forecastZone)}`;
      if (seen.has(key)) repeatedHours.add(key);
      seen.add(key);
    }
  }
  const controls =
    forecast.connected && forecast.available && timeZone && forecast.type ? (
      <div ref={controlsRef} className='canvas-weather__tabs' aria-label='Forecast period'>
        {forecast.types.includes('hourly') && (
          <button
            type='button'
            data-forecast-period='hourly'
            aria-pressed={forecast.type === 'hourly'}
            onClick={() => setRequested('hourly')}
          >
            Next 12 hours
          </button>
        )}
        {forecast.types.includes('daily') && (
          <button type='button' data-forecast-period='daily' aria-pressed={forecast.type === 'daily'} onClick={() => setRequested('daily')}>
            Daily
          </button>
        )}
        {forecast.types.includes('twice_daily') && (
          <button
            type='button'
            data-forecast-period='twice_daily'
            aria-pressed={forecast.type === 'twice_daily'}
            onClick={() => setRequested('twice_daily')}
          >
            Day / night
          </button>
        )}
      </div>
    ) : null;
  const headerControls = Boolean(dialogProps && wide);
  const content = (
    <section className='canvas-weather' aria-label='Forecast'>
      <CurrentWeatherHero
        condition={entity?.state}
        temperatureValue={entity?.attributes.temperature}
        unit={unit}
        location='Verdun, Montréal'
        connected={forecast.connected}
        available={forecast.available}
      />
      {!forecast.connected ? (
        <p role='status'>Reconnecting to Home Assistant… Forecast updates are paused.</p>
      ) : !forecast.available ? (
        <p role='status'>Weather unavailable. The forecast will return when the provider reconnects.</p>
      ) : !timeZone ? (
        <p role='status'>Waiting for Home Assistant weather configuration…</p>
      ) : !forecast.type ? (
        <p role='status'>This weather provider does not provide forecasts.</p>
      ) : (
        <>
          {unsupportedHourly && (
            <p role='status'>Hourly forecasts are unavailable from this weather provider. Choose an available forecast.</p>
          )}
          {!headerControls && controls}
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
              <div className='canvas-weather__table'>
                <div className={`canvas-weather__column-head canvas-weather__column-head--${forecast.type}`} aria-hidden='true'>
                  <span>Time</span>
                  <span className='canvas-weather__condition-heading'>Conditions</span>
                  <span>{forecast.type === 'hourly' ? 'Temp.' : 'Temperature'}</span>
                  {forecast.type === 'hourly' && <span>Wind{windUnit && <small>{windUnit}</small>}</span>}
                  <span>Precip.</span>
                </div>
                <ul className='canvas-weather__list'>
                  {entries.map((entry, index) => {
                    const dateKey = forecastDateKey(entry.datetime, forecastZone);
                    const previousDate = index ? forecastDateKey(entries[index - 1].datetime, forecastZone) : null;
                    const repeated = repeatedHours.has(`${dateKey} ${forecastHourLabel(entry.datetime, forecastZone)}`);
                    const dateHeading =
                      forecast.type === 'hourly' && dateKey !== previousDate
                        ? new Intl.DateTimeFormat('en-US', {
                            timeZone: forecastZone,
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          }).format(new Date(entry.datetime))
                        : undefined;
                    return (
                      <ForecastRow
                        key={`${entry.datetime}-${index}`}
                        entry={entry}
                        type={forecast.type!}
                        timeZone={forecastZone}
                        unit={unit}
                        windUnit={windUnit}
                        precipitationUnit={precipitationUnit}
                        repeated={repeated}
                        dateHeading={dateHeading}
                      />
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
  return dialogProps ? (
    <CanvasDialog {...dialogProps} title='Weather' headerAccessory={headerControls ? controls : undefined}>
      {content}
    </CanvasDialog>
  ) : (
    content
  );
}

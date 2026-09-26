import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useStore, type LightEntity } from '@hakit/core';
import { lightSupportsBrightness, useCanvasLights } from './useCanvasLights';

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function rgbFromHex(hex: string): [number, number, number] {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}
function hexFromRgb(rgb?: [number, number, number]): string {
  return rgb?.length === 3 ? `#${rgb.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}` : '#ffffff';
}

export function CanvasLightDetails({
  entityId,
  embedded = false,
  closeControl,
}: {
  entityId: string;
  embedded?: boolean;
  closeControl?: ReactNode;
}) {
  const { rooms, power, send, busy, connected, result } = useCanvasLights();
  const light = rooms.flatMap(room => room.lights).find(item => item.id === entityId);
  const roomName = rooms.find(room => room.lights.some(item => item.id === entityId))?.name;
  let title = light?.name ?? 'Light';
  if (embedded) {
    title = title.replace(/^light[ _-]+/i, '');
    if (roomName && title.toLowerCase().startsWith(roomName.toLowerCase()) && /^[ _-]/.test(title.slice(roomName.length))) {
      title = title.slice(roomName.length).replace(/^[ _-]+/, '');
    }
    title = (title[0]?.toUpperCase() + title.slice(1)).replace(/\bled\b/gi, 'LED');
  }
  const entity = light?.entity;
  const attrs = entity?.attributes;
  const available = Boolean(connected && light && light.state !== 'unavailable');
  const working = busy.has(entityId);
  const modes = attrs?.supported_color_modes ?? [];
  const colour = modes.some(mode => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(mode));
  const effects = attrs?.effect_list?.filter(Boolean) ?? [];
  const kelvinMin = numeric(attrs?.min_color_temp_kelvin);
  const kelvinMax = numeric(attrs?.max_color_temp_kelvin);
  const miredMin = numeric(attrs?.min_mireds);
  const miredMax = numeric(attrs?.max_mireds);
  const temperature =
    modes.includes('color_temp') &&
    (kelvinMin !== undefined && kelvinMax !== undefined
      ? { min: kelvinMin, max: kelvinMax, value: numeric(attrs?.color_temp_kelvin), key: 'color_temp_kelvin', unit: 'K' }
      : miredMin !== undefined && miredMax !== undefined
        ? { min: miredMin, max: miredMax, value: numeric(attrs?.color_temp), key: 'color_temp', unit: 'mired' }
        : null);
  const [brightnessDraft, setBrightnessDraft] = useState<number | null>(null);
  const brightnessPointerActive = useRef(false);
  const brightnessPointerCancelled = useRef(false);
  const [temperatureDraft, setTemperatureDraft] = useState<number | null>(null);
  const [colourDraft, setColourDraft] = useState<string | null>(null);
  const [effectDraft, setEffectDraft] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const colourDescriptionId = useId();
  if (!light) return <p role='status'>This light is not in the current inventory.</p>;
  const sendValue = async (data: Record<string, unknown>, observe: (next: LightEntity) => boolean, clear: () => void) => {
    if (!available || working || committing) return;
    setCommitting(true);
    try {
      const outcome = await send({ domain: 'light', service: 'turn_on', targets: [entityId], data }, id => {
        const next = useStore.getState().entities[id] as LightEntity | undefined;
        return Boolean(next?.state === 'on' && observe(next));
      });
      if (outcome?.results.every(item => item.phase === 'observed')) clear();
    } finally {
      setCommitting(false);
    }
  };
  const brightness = entity?.state === 'on' ? numeric(attrs?.brightness) : undefined;
  const brightnessPercent = brightness === undefined ? undefined : Math.round((brightness / 255) * 100);
  const brightnessPosition = brightnessDraft ?? brightnessPercent ?? 50;
  const temperatureValue = entity?.state === 'on' && temperature ? temperature.value : undefined;
  const temperaturePosition =
    temperatureDraft ?? temperatureValue ?? (temperature ? Math.round((temperature.min + temperature.max) / 2) : 0);
  const reportedColour = entity?.state === 'on' ? attrs?.rgb_color : undefined;
  const colourValue = colourDraft ?? hexFromRgb(reportedColour);
  const commitBrightness = () => {
    if (brightnessDraft === null) return;
    const value = Math.round((brightnessDraft / 100) * 255);
    void sendValue(
      { brightness: value },
      next => Math.abs(Number(next.attributes.brightness) - value) <= 1,
      () => setBrightnessDraft(null)
    );
  };
  const cancelBrightnessPointer = () => {
    brightnessPointerActive.current = false;
    brightnessPointerCancelled.current = true;
    setBrightnessDraft(null);
  };
  const commitTemperature = () => {
    if (!temperature || temperatureDraft === null) return;
    const value = temperatureDraft;
    void sendValue(
      { [temperature.key]: value },
      next => numeric(next.attributes[temperature.key as keyof LightEntity['attributes']]) === value,
      () => setTemperatureDraft(null)
    );
  };
  const commitColour = () => {
    if (colourDraft === null) return;
    const rgb = rgbFromHex(colourDraft);
    void sendValue(
      { rgb_color: rgb },
      next => next.attributes.rgb_color?.every((value, index) => Math.abs(value - rgb[index]) <= 1) === true,
      () => setColourDraft(null)
    );
  };
  const commitEffect = () => {
    if (effectDraft === null) return;
    const effect = effectDraft;
    void sendValue(
      { effect },
      next => next.attributes.effect === effect,
      () => setEffectDraft(null)
    );
  };
  const failed = result?.results.find(item => item.target === entityId && (item.phase === 'failed' || item.phase === 'unconfirmed'));
  const phase = result?.results.find(item => item.target === entityId)?.phase;
  return (
    <section className='canvas-lights canvas-lights--detail' aria-label={`${light.name} controls`}>
      <div className='canvas-lights__heading'>
        <div>
          <h3>{title}</h3>
          <p className='canvas-lights__muted'>{light.state === 'unavailable' ? 'Unavailable' : light.state === 'on' ? 'On' : 'Off'}</p>
        </div>
        <button
          type='button'
          aria-label={`Turn ${light.state === 'on' ? 'off' : 'on'} ${light.name}`}
          disabled={!available || working || committing}
          onClick={() => void power([entityId], light.state === 'on' ? 'off' : 'on')}
        >
          {light.state === 'on' ? 'Turn off' : 'Turn on'}
        </button>
        {closeControl}
      </div>
      <div className={embedded ? 'canvas-light-settings__controls' : undefined}>
        {lightSupportsBrightness(entity) && (
          <label className='canvas-lights__slider'>
            Brightness
            <input
              aria-label='Light brightness'
              aria-valuetext={`${brightnessDraft !== null || brightnessPercent === undefined ? 'proposed' : 'reported'} ${brightnessPosition} percent${brightnessPercent === undefined ? '; current brightness unknown' : ''}`}
              type='range'
              min='1'
              max='100'
              value={brightnessPosition}
              style={{ '--canvas-light-level': `${brightnessPosition}%` } as CSSProperties}
              disabled={!available || working || committing}
              onChange={event => {
                if (!brightnessPointerActive.current) brightnessPointerCancelled.current = false;
                setBrightnessDraft(Number(event.target.value));
              }}
              onPointerDown={() => {
                brightnessPointerActive.current = true;
                brightnessPointerCancelled.current = false;
              }}
              onPointerCancel={cancelBrightnessPointer}
              onPointerUp={() => {
                brightnessPointerActive.current = false;
                if (!brightnessPointerCancelled.current) commitBrightness();
              }}
              onKeyUp={() => {
                if (!brightnessPointerActive.current) commitBrightness();
              }}
              onBlur={() => {
                if (brightnessPointerActive.current) cancelBrightnessPointer();
                else if (!brightnessPointerCancelled.current) commitBrightness();
              }}
            />
            <output>
              {embedded
                ? `${brightnessDraft !== null || brightnessPercent === undefined ? 'Proposed ' : ''}${brightnessPosition}%`
                : `${brightnessDraft !== null || brightnessPercent === undefined ? 'Proposed' : 'Reported'} brightness ${brightnessPosition}%`}
            </output>
            {brightnessPercent === undefined && <small className='canvas-lights__reading'>Current brightness unknown</small>}
          </label>
        )}
        {colour && (
          <label className='canvas-lights__field'>
            Colour
            <input
              aria-label='Light colour'
              aria-describedby={colourDescriptionId}
              type='color'
              value={colourValue}
              disabled={!available || working || committing}
              onChange={event => setColourDraft(event.target.value)}
              onBlur={commitColour}
            />
            <button type='button' disabled={!available || working || committing || colourDraft === null} onClick={commitColour}>
              Apply colour
            </button>
            <span
              id={colourDescriptionId}
              className={embedded && reportedColour !== undefined ? 'canvas-light-settings__sr-only' : 'canvas-lights__reading'}
            >
              {reportedColour === undefined ? 'Current colour unknown' : `Reported colour ${hexFromRgb(reportedColour)}`}
            </span>
            <output className={embedded ? 'canvas-light-settings__sr-only' : undefined}>
              {colourDraft !== null || reportedColour === undefined ? 'Proposed' : 'Reported'} colour {colourValue}
            </output>
          </label>
        )}
        {temperature && (
          <label className='canvas-lights__slider'>
            Colour temperature
            <input
              aria-label='Light colour temperature'
              aria-valuetext={`${temperatureDraft !== null || temperatureValue === undefined ? 'proposed' : 'reported'} ${temperaturePosition} ${temperature.unit}${temperatureValue === undefined ? '; current colour temperature unknown' : ''}`}
              type='range'
              min={temperature.min}
              max={temperature.max}
              value={temperaturePosition}
              style={
                {
                  '--canvas-light-level': `${((temperaturePosition - temperature.min) / (temperature.max - temperature.min)) * 100}%`,
                } as CSSProperties
              }
              disabled={!available || working || committing}
              onChange={event => setTemperatureDraft(Number(event.target.value))}
              onPointerUp={commitTemperature}
              onKeyUp={commitTemperature}
              onBlur={commitTemperature}
            />
            <output>
              {embedded
                ? `${temperatureDraft !== null || temperatureValue === undefined ? 'Proposed ' : ''}${temperaturePosition} ${temperature.unit}`
                : `${temperatureDraft !== null || temperatureValue === undefined ? 'Proposed' : 'Reported'} colour temperature ${temperaturePosition} ${temperature.unit}`}
            </output>
            {temperatureValue === undefined && <small className='canvas-lights__reading'>Current colour temperature unknown</small>}
          </label>
        )}
        {effects.length > 0 && (
          <label className='canvas-lights__field'>
            Effect
            <select
              aria-label='Light effect'
              value={effectDraft ?? attrs?.effect ?? ''}
              disabled={!available || working || committing}
              onChange={event => setEffectDraft(event.target.value)}
            >
              <option value=''>Choose effect</option>
              {effects.map(effect => (
                <option key={effect}>{effect}</option>
              ))}
            </select>
            <button type='button' disabled={!available || working || committing || effectDraft === null} onClick={commitEffect}>
              Apply effect
            </button>
          </label>
        )}
        {failed && (
          <p className='canvas-lights__error' role='alert'>
            {failed.message}
          </p>
        )}
        {!failed && phase && (!embedded || phase !== 'observed') && (
          <p className='canvas-lights__muted' role='status'>
            {phase === 'pending'
              ? 'Sending command…'
              : phase === 'accepted'
                ? 'Service accepted; waiting for reported state.'
                : 'Reported state updated.'}
          </p>
        )}
      </div>
    </section>
  );
}

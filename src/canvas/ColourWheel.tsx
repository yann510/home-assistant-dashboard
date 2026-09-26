import { useId, useRef, type PointerEvent } from 'react';
import './colour-wheel.css';

function hueSaturation(hex: string) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const hue = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { hue: (hue * 60 + 360) % 360, saturation: max === 0 ? 0 : delta / max };
}
function colourHex(hue: number, saturation: number) {
  const x = saturation * (1 - Math.abs(((hue / 60) % 2) - 1));
  const rgb =
    hue < 60
      ? [saturation, x, 0]
      : hue < 120
        ? [x, saturation, 0]
        : hue < 180
          ? [0, saturation, x]
          : hue < 240
            ? [0, x, saturation]
            : hue < 300
              ? [x, 0, saturation]
              : [saturation, 0, x];
  return `#${rgb
    .map(value =>
      Math.round((value + 1 - saturation) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/** A draft-only hue/saturation control. Brightness is deliberately independent. */
export function ColourWheel({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (hex: string) => void }) {
  const helpId = useId();
  const dragging = useRef<number | null>(null);
  const startValue = useRef(value);
  const { hue, saturation } = hueSaturation(value);
  const changeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = bounds.width / 2;
    if (!radius || disabled) return;
    const x = event.clientX - bounds.left - radius,
      y = event.clientY - bounds.top - bounds.height / 2;
    onChange(colourHex(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, Math.min(1, Math.hypot(x, y) / radius)));
  };
  return (
    <>
      <div
        className='canvas-colour-wheel'
        role='slider'
        aria-label='Colour wheel'
        aria-describedby={helpId}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hue)}
        aria-valuetext={`Hue ${Math.round(hue)} degrees, saturation ${Math.round(saturation * 100)} percent`}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={event => {
          if (disabled || !event.isPrimary || event.button !== 0) return;
          startValue.current = value;
          dragging.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          changeFromPointer(event);
        }}
        onPointerMove={event => {
          if (dragging.current === event.pointerId) changeFromPointer(event);
        }}
        onPointerUp={event => {
          if (dragging.current !== event.pointerId) return;
          changeFromPointer(event);
          dragging.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          if (dragging.current !== null) onChange(startValue.current);
          dragging.current = null;
        }}
        onLostPointerCapture={() => {
          dragging.current = null;
        }}
        onKeyDown={event => {
          if (disabled) return;
          const step = event.shiftKey ? 10 : 2;
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const nextHue = (hue + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) + 360) % 360;
            const nextSaturation =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? 1
                  : Math.max(
                      0,
                      Math.min(1, saturation + (event.key === 'ArrowUp' ? step / 100 : event.key === 'ArrowDown' ? -step / 100 : 0))
                    );
            onChange(colourHex(nextHue, nextSaturation));
          }
        }}
      >
        <span
          className='canvas-colour-wheel__marker'
          style={{
            left: `${50 + 46 * saturation * Math.cos((hue * Math.PI) / 180)}%`,
            top: `${50 + 46 * saturation * Math.sin((hue * Math.PI) / 180)}%`,
            background: value,
          }}
        />
      </div>
      <span id={helpId} className='canvas-light-settings__sr-only'>
        Left and right change hue. Up and down change saturation. Home selects white; End selects full saturation.
      </span>
    </>
  );
}

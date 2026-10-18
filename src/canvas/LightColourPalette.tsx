import type { CSSProperties } from 'react';

import { lightColourPresets } from './lightColours';

export function LightColourPalette({
  scope,
  value,
  disabled,
  onChange,
}: {
  scope: 'Room' | 'Light';
  value?: string;
  disabled: boolean;
  onChange(hex: string): void;
}) {
  return (
    <div className='canvas-light-palette' role='group' aria-label={`${scope} colour presets`}>
      {lightColourPresets.map(preset => (
        <button
          type='button'
          key={preset.name}
          aria-label={preset.name}
          aria-pressed={value === preset.hex}
          disabled={disabled}
          onClick={() => onChange(preset.hex)}
          style={{ '--canvas-swatch': preset.hex } as CSSProperties}
        >
          <span aria-hidden='true' />
        </button>
      ))}
      {scope === 'Room' && (
        <label className='canvas-light-palette__custom'>
          Custom
          <input
            type='color'
            aria-label='Custom room colour'
            value={value ?? '#ffffff'}
            disabled={disabled}
            onChange={event => onChange(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}

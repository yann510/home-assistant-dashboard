import { ButtonCard } from '@hakit/components';
import { useEntity } from '@hakit/core';

export const HomeModeControls = ({ compact = false, disabled = false }: { compact?: boolean; disabled?: boolean }) => {
  const morningMode = useEntity('input_boolean.morning_mode');
  const nightMode = useEntity('input_boolean.night_mode');

  if (compact)
    return (
      <section className='home-modes home-modes--compact' aria-label='Home mode'>
        {[
          { entity: morningMode, label: 'Day', icon: '☀' },
          { entity: nightMode, label: 'Night', icon: '☾' },
        ].map(({ entity, label, icon }) => (
          <button
            key={label}
            type='button'
            aria-pressed={entity.state === 'on'}
            disabled={disabled || !['on', 'off'].includes(entity.state)}
            onClick={() => {
              if (entity.state === 'off') entity.service.turnOn();
            }}
          >
            <span aria-hidden='true'>{icon}</span>
            {label}
          </button>
        ))}
      </section>
    );
  return (
    <section className='home-modes' aria-label='Home mode'>
      <ButtonCard
        className='button-card mode-card'
        entity='input_boolean.morning_mode'
        icon='mdi:white-balance-sunny'
        title='Day'
        aria-pressed={morningMode.state === 'on'}
        layoutType='slim'
        hideDetails
        hideState
        hideLastUpdated
        disableModal
        onClick={entity => {
          if (entity.state !== 'on') entity.service.turnOn();
        }}
      />
      <ButtonCard
        className='button-card mode-card'
        entity='input_boolean.night_mode'
        icon='mdi:weather-night'
        title='Night'
        aria-pressed={nightMode.state === 'on'}
        layoutType='slim'
        hideDetails
        hideState
        hideLastUpdated
        disableModal
        onClick={entity => {
          if (entity.state !== 'on') entity.service.turnOn();
        }}
      />
    </section>
  );
};

import { ButtonCard } from '@hakit/components';
import { useEntity } from '@hakit/core';

export const HomeModeControls = () => {
  const morningMode = useEntity('input_boolean.morning_mode');
  const nightMode = useEntity('input_boolean.night_mode');

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

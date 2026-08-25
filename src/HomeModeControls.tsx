import { ButtonCard } from '@hakit/components';
import { useEntity } from '@hakit/core';

export const HomeModeControls = () => {
  const morningMode = useEntity('input_boolean.morning_mode');
  const nightMode = useEntity('input_boolean.night_mode');
  const morningModeStatus = morningMode.state === 'on' ? 'Active' : morningMode.state === 'off' ? 'Inactive' : 'Unavailable';
  const nightModeStatus = nightMode.state === 'on' ? 'Active' : nightMode.state === 'off' ? 'Inactive' : 'Unavailable';

  return (
    <section className='home-modes' aria-label='Home modes'>
      <ButtonCard
        className='button-card mode-card'
        entity='input_boolean.morning_mode'
        icon='mdi:white-balance-sunny'
        title='Morning Mode'
        description={morningModeStatus}
        aria-pressed={morningMode.state === 'on'}
        layoutType='slim'
        hideState
        hideLastUpdated
        disableModal
        onClick={entity => entity.service.toggle()}
      />
      <ButtonCard
        className='button-card mode-card'
        entity='input_boolean.night_mode'
        icon='mdi:weather-night'
        title='Night Mode'
        description={nightModeStatus}
        aria-pressed={nightMode.state === 'on'}
        layoutType='slim'
        hideState
        hideLastUpdated
        disableModal
        onClick={entity => entity.service.toggle()}
      />
    </section>
  );
};

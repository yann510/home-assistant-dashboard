import { EntityName, FilterByDomain, HassEntityWithService, useEntity } from '@hakit/core';
import { ButtonCard } from '@hakit/components';
import { useState, useEffect, useRef } from 'react';
import { useHasSmallScreen } from './useHasSmallScreen.tsx';

type LightEntityName = FilterByDomain<EntityName, 'light'>;

const mobileLightTitles: Partial<Record<LightEntityName, string>> = {
  'light.light_front_door': 'Front Door',
  'light.light_laundry_room': 'Laundry',
  'light.light_kitchen': 'Kitchen',
  'light.light_living_room_bulbs': 'Living Room',
  'light.living_room_led_strip': 'LED Strip',
  'light.office_bulbs': 'Office',
  'light.desk_led_strip': 'Desk Strip',
  'light.light_bedroom': 'Bedroom',
  'light.bedroom_closet': 'Closet',
  'light.light_toilet': 'Toilet',
  'light.gym': 'Gym',
};

interface Props {
  lightEntityName: LightEntityName;
}

export const LightCard = (props: Props) => {
  const [isChangingState, setIsChangingState] = useState(false);
  const lightEntity = useEntity(props.lightEntityName);
  const hasSmallScreen = useHasSmallScreen();
  const [stateAtClick, setStateAtClick] = useState(lightEntity.state);
  const [lastObservedState, setLastObservedState] = useState(lightEntity.state);
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (lastObservedState !== lightEntity.state) {
    setLastObservedState(lightEntity.state);
    setIsChangingState(false);
  }

  const onCardClick = (entity: HassEntityWithService<'light'>) => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
    }

    setStateAtClick(entity.state);
    setIsChangingState(true);

    entity.service.toggle();

    timeoutId.current = setTimeout(() => {
      setIsChangingState(false);
    }, 10_000);
  };

  useEffect(() => {
    if (!isChangingState && timeoutId.current) {
      clearTimeout(timeoutId.current);
      timeoutId.current = null;
    }
  }, [isChangingState]);

  useEffect(() => {
    return () => {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
      }
    };
  }, []);

  return (
    <ButtonCard
      className='button-card light-card'
      icon={lightEntity.state === 'on' ? 'mdi:lightbulb-on-outline' : 'mdi:lightbulb-outline'}
      onClick={onCardClick}
      layoutType={hasSmallScreen ? 'slim-vertical' : 'default'}
      hideDetails={hasSmallScreen}
      hideLastUpdated={hasSmallScreen}
      entity={props.lightEntityName}
      title={hasSmallScreen ? mobileLightTitles[props.lightEntityName] : undefined}
      disabled={isChangingState && stateAtClick === lightEntity.state}
    />
  );
};

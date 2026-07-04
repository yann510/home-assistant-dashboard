import { EntityName, FilterByDomain, HassEntityWithService, useEntity } from '@hakit/core';
import { ButtonCard } from '@hakit/components';
import { useState, useEffect, useRef } from 'react';
import { useHasSmallScreen } from './useHasSmallScreen.tsx';

type LightEntityName = FilterByDomain<EntityName, 'light'>;

interface Props {
  lightEntityName: LightEntityName;
}

export const LightCard = (props: Props) => {
  const [isChangingState, setIsChangingState] = useState(false);
  const lightEntity = useEntity(props.lightEntityName);
  const hasSmallScreen = useHasSmallScreen();
  const [stateAtClick, setStateAtClick] = useState(lightEntity.state);
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (isChangingState && stateAtClick !== lightEntity.state) {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
        timeoutId.current = null;
      }
    }
  }, [isChangingState, lightEntity.state, stateAtClick]);

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
      disabled={isChangingState && stateAtClick === lightEntity.state}
    />
  );
};

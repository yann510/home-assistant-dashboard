/* eslint-disable @typescript-eslint/no-explicit-any */
import { EntityName, HassEntityWithService, useEntity } from '@hakit/core';
import { ButtonCard } from '@hakit/components';
import { useState, useEffect } from 'react';
import { useHasSmallScreen } from './useHasSmallScreen.tsx';

interface Props<E extends EntityName> {
  lightEntityName: E;
}

export const LightCard = <E extends EntityName>(props: Props<E>) => {
  const [isChangingState, setIsChangingState] = useState(false);
  const lightEntity = useEntity(props.lightEntityName);
  const hasSmallScreen = useHasSmallScreen();
  let timeoutId: NodeJS.Timeout | null = null;

  const onCardClick = (entity: HassEntityWithService<'light'>) => {
    setIsChangingState(true);

    entity.service.toggle();

    timeoutId = setTimeout(() => {
      setIsChangingState(false);
    }, 10_000);
  };

  useEffect(
    function enableCardWhenStateChanges() {
      setIsChangingState(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lightEntity.state]
  );

  return (
    <ButtonCard
      className='button-card light-card'
      icon={lightEntity.state === 'on' ? 'mdi:lightbulb-on-outline' : 'mdi:lightbulb-outline'}
      onClick={onCardClick as any}
      defaultLayout={hasSmallScreen ? 'slim-vertical' : 'default'}
      hideDetails={hasSmallScreen}
      hideLastUpdated={hasSmallScreen}
      entity={props.lightEntityName}
      disabled={isChangingState}
    />
  );
};

import { Group } from '@hakit/components';
import { BlindCard } from './BlindCard.tsx';
import styled from '@emotion/styled';
import { useEffect, useState } from 'react';
import { useHasSmallScreen } from './useHasSmallScreen.tsx';

const BlindCardsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

export const BlindsGroup = () => {
  const [isGroupCollapsed, setIsGroupCollapsed] = useState<boolean | undefined>(undefined);
  const hasSmallScreen = useHasSmallScreen();

  useEffect(() => {
    if (hasSmallScreen && isGroupCollapsed === undefined) {
      setIsGroupCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSmallScreen]);

  return (
    <Group title={'Blinds'} className={'group-container'} collapsed={isGroupCollapsed}>
      <BlindCardsContainer>
        <BlindCard room={'bedroom'} />
        <BlindCard room={'living room'} />
        <BlindCard room={'gym'} />
      </BlindCardsContainer>
    </Group>
  );
};

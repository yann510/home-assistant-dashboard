import { Group } from '@hakit/components';
import { BlindCard } from './BlindCard.tsx';
import styled from '@emotion/styled';

const BlindCardsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
  gap: 8px;
`;

export const BlindsGroup = () => {
  return (
    <Group title={'Blinds'} className={'group-container'} collapsed={true}>
      <BlindCardsContainer>
        <BlindCard room={'bedroom'} />
        <BlindCard room={'living room'} />
        <BlindCard room={'gym'} />
      </BlindCardsContainer>
    </Group>
  );
};

import { BlindCard } from './BlindCard.tsx';
import styled from '@emotion/styled';
import { DashboardSection } from './DashboardSection.tsx';

const BlindCardsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
  gap: 8px;
`;

export const BlindsGroup = () => {
  return (
    <DashboardSection title='Blinds' className='blinds-group'>
      <BlindCardsContainer>
        <BlindCard room={'bedroom'} />
        <BlindCard room={'living room'} />
        <BlindCard room={'gym'} />
      </BlindCardsContainer>
    </DashboardSection>
  );
};

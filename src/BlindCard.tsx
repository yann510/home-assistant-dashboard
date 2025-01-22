import { capitalize } from './utils.ts';
import { Column, FabCard } from '@hakit/components';
import { useHass } from '@hakit/core';
import { useRef, useState } from 'react';
import styled from '@emotion/styled';
import { CardBase } from '@hakit/components';

interface Props {
  room: 'bedroom' | 'living room' | 'gym';
}

const StyledCard = styled(CardBase)`
  transform: none;
  will-change: width, height;
  svg {
    color: currentColor;
  }
  &:not(.disabled) {
    &:hover,
    &:active {
      background-color: var(--ha-S300);
      svg {
        color: currentColor;
      }
    }
  }
  padding: 1rem !important;
  cursor: default;
  max-width: 208px;
  width: 100% !important;
  height: 100% !important;
`;

const FabContainer = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: center;
`;

const FabWithText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  text-align: center;
  font-size: 0.8rem;
`;

interface ButtonActionState {
  isDisabled: boolean;
  isActive: boolean | undefined;
}

interface ButtonState {
  open: ButtonActionState;
  close: ButtonActionState;
  stop: ButtonActionState;
}

const buttonStateInitialState = {
  open: { isActive: false, isDisabled: false },
  close: { isActive: false, isDisabled: false },
  stop: { isActive: false, isDisabled: false },
};

export const BlindCard = ({ room }: Props) => {
  const { callService } = useHass();
  const [buttonStates, setButtonStates] = useState<ButtonState>(buttonStateInitialState);
  const shortTimeout = useRef<NodeJS.Timeout>(null);
  const longTimeout = useRef<NodeJS.Timeout>(null);

  const controlBedroomBlinds = (action: 'open' | 'close' | 'stop') => {
    if (shortTimeout.current) clearTimeout(shortTimeout.current);
    if (longTimeout.current) clearTimeout(longTimeout.current);
    const updateButtonState = (updates: Partial<ButtonActionState>) => setButtonStates(prev => ({ ...prev, [action]: { ...updates } }));

    setButtonStates(buttonStateInitialState);
    updateButtonState({ isDisabled: true, isActive: true });

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    callService({
      domain: 'google_assistant_sdk',
      service: 'send_text_command',
      serviceData: {
        command: `${action} all the blinds ${room}`,
      },
    });

    shortTimeout.current = setTimeout(() => updateButtonState({ isDisabled: false, isActive: action !== 'stop' }), 5_000);
    longTimeout.current = setTimeout(() => updateButtonState({ isDisabled: false, isActive: false }), 20_000);
  };

  return (
    <StyledCard>
      <Column gap={'1rem'} justifyContent={'center'}>
        {capitalize(room)}
        <FabContainer>
          <FabWithText>
            <FabCard
              cssStyles={{ backgroundColor: 'var(--ha-S500)' }}
              icon={'mdi:curtains'}
              onClick={() => controlBedroomBlinds('open')}
              disabled={buttonStates.open.isDisabled}
              active={buttonStates.open.isActive}
            />
            Open
          </FabWithText>
          <FabWithText>
            <FabCard
              cssStyles={{ backgroundColor: 'var(--ha-S500)' }}
              icon={'mdi:stop'}
              onClick={() => controlBedroomBlinds('stop')}
              disabled={buttonStates.stop.isDisabled}
              active={buttonStates.stop.isActive}
            />
            Stop
          </FabWithText>
          <FabWithText>
            <FabCard
              cssStyles={{ backgroundColor: 'var(--ha-S500)' }}
              icon={'mdi:curtains-closed'}
              onClick={() => controlBedroomBlinds('close')}
              disabled={buttonStates.close.isDisabled}
              active={buttonStates.close.isActive}
            />
            Close
          </FabWithText>
        </FabContainer>
      </Column>
    </StyledCard>
  );
};

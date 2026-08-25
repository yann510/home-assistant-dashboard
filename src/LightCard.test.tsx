// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightCard } from './LightCard.tsx';

const light = vi.hoisted(() => ({
  state: 'off',
  toggle: vi.fn(),
}));

vi.mock('@hakit/core', () => ({
  useEntity: () => ({
    state: light.state,
    service: { toggle: light.toggle },
  }),
}));

vi.mock('@hakit/components', () => ({
  ButtonCard: ({ disabled, onClick }: { disabled?: boolean; onClick: (entity: unknown) => void }) => (
    <button type='button' disabled={disabled} onClick={() => onClick({ state: light.state, service: { toggle: light.toggle } })}>
      Office light
    </button>
  ),
}));

vi.mock('./useHasSmallScreen.tsx', () => ({
  useHasSmallScreen: () => false,
}));

afterEach(() => {
  cleanup();
  light.state = 'off';
  light.toggle.mockReset();
});

describe('LightCard', () => {
  it('clears its pending state after Home Assistant confirms the toggle', () => {
    const { rerender } = render(<LightCard lightEntityName='light.office_bulbs' />);
    const card = screen.getByRole('button', { name: 'Office light' });

    fireEvent.click(card);
    expect(card.hasAttribute('disabled')).toBe(true);

    act(() => {
      light.state = 'on';
      rerender(<LightCard lightEntityName='light.office_bulbs' />);
    });
    act(() => {
      light.state = 'off';
      rerender(<LightCard lightEntityName='light.office_bulbs' />);
    });

    expect(screen.getByRole('button', { name: 'Office light' }).hasAttribute('disabled')).toBe(false);
  });
});

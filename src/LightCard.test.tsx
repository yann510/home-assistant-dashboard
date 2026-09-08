// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightCard } from './LightCard.tsx';

const light = vi.hoisted(() => ({
  state: 'off',
  missing: false,
  toggle: vi.fn(),
}));

const screenSize = vi.hoisted(() => ({
  isSmall: false,
}));

vi.mock('@hakit/core', () => ({
  useEntity: (_id: string, options?: { returnNullIfNotFound?: boolean }) => {
    if (light.missing) {
      if (options?.returnNullIfNotFound) return null;
      throw new Error('Entity not found');
    }
    return {
      state: light.state,
      service: { toggle: light.toggle },
    };
  },
}));

vi.mock('@hakit/components', () => ({
  ButtonCard: ({
    disabled,
    entity,
    onClick,
    title,
  }: {
    disabled?: boolean;
    entity: string;
    onClick: (entity: unknown) => void;
    title?: string;
  }) => (
    <button type='button' disabled={disabled} onClick={() => onClick({ state: light.state, service: { toggle: light.toggle } })}>
      {title ?? entity}
    </button>
  ),
}));

vi.mock('./useHasSmallScreen.tsx', () => ({
  useHasSmallScreen: () => screenSize.isSmall,
}));

afterEach(() => {
  cleanup();
  light.state = 'off';
  light.missing = false;
  light.toggle.mockReset();
  screenSize.isSmall = false;
});

describe('LightCard', () => {
  it('renders a disabled missing light and recovers when the entity returns', () => {
    light.missing = true;
    const { rerender } = render(<LightCard lightEntityName='light.neon_light_led_strip' />);
    expect(screen.getByRole('button', { name: 'Neon · Unavailable' }).hasAttribute('disabled')).toBe(true);
    light.missing = false;
    rerender(<LightCard lightEntityName='light.neon_light_led_strip' />);
    expect(screen.getByRole('button', { name: 'light.neon_light_led_strip' }).hasAttribute('disabled')).toBe(false);
  });

  it('clears its pending state after Home Assistant confirms the toggle', () => {
    const { rerender } = render(<LightCard lightEntityName='light.office_bulbs' />);
    const card = screen.getByRole('button', { name: 'light.office_bulbs' });

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

    expect(screen.getByRole('button', { name: 'light.office_bulbs' }).hasAttribute('disabled')).toBe(false);
  });

  it('uses concise room names on small screens', () => {
    screenSize.isSmall = true;

    render(<LightCard lightEntityName='light.light_front_door' />);

    expect(screen.getByRole('button', { name: 'Front Door' })).not.toBeNull();
  });
});

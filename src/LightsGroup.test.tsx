// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightsGroup } from './LightsGroup.tsx';

vi.mock('./LightCard.tsx', () => ({
  LightCard: ({ lightEntityName }: { lightEntityName: string }) => <button type='button'>{lightEntityName}</button>,
}));

afterEach(cleanup);

describe('LightsGroup', () => {
  it('arranges the lights into spatial house groups', () => {
    render(<LightsGroup />);

    const expectedGroups = [
      ['Entry', ['light.light_front_door', 'light.light_laundry_room']],
      ['Kitchen', ['light.light_kitchen']],
      ['Office', ['light.office_bulbs', 'light.desk_led_strip']],
      ['Gym', ['light.gym']],
      ['Living Room', ['light.light_living_room_bulbs', 'light.living_room_led_strip']],
      ['Toilet', ['light.light_toilet']],
      ['Bedroom', ['light.light_bedroom', 'light.bedroom_closet']],
    ] as const;

    expect(screen.getAllByRole('group').map(group => group.getAttribute('aria-label'))).toEqual(expectedGroups.map(([name]) => name));

    expectedGroups.forEach(([name, lights]) => {
      const group = screen.getByRole('group', { name });
      expect(
        within(group)
          .getAllByRole('button')
          .map(light => light.textContent)
      ).toEqual(lights);
    });
  });
});

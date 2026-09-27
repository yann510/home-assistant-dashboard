// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { lightLabel } from './lightLabels';
import { rooms } from '../useLightSummary';

describe('dashboard light labels', () => {
  it('uses stable labels despite vendor names and preserves distinct fixtures', () => {
    expect(lightLabel('light.living_room_led_strip', 'Smart WiFi music LED Strip Living Room Led Strip', 'Living Room')).toBe('LED strip');
    expect(lightLabel('light.neon_light_led_strip', 'neon light LED strip', 'Office')).toBe('Neon strip');
    expect(lightLabel('light.light_kitchen', 'Light Kitchen', 'Kitchen')).toBe('Main light');
    for (const room of rooms) {
      const labels = room.lights.map(id => lightLabel(id, '', room.name));
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
  it('retains meaningful unknown names and has a readable missing-name fallback', () => {
    expect(lightLabel('light.new_lamp', 'Office Desk lamp', 'Office')).toBe('Desk lamp');
    expect(lightLabel('light.new_lamp', 'Officework task light', 'Office')).toBe('Officework task light');
    expect(lightLabel('light.new_lamp', '', 'Office')).toBe('New lamp');
    expect(lightLabel('light.new_lamp', 'Office', 'Office')).toBe('Office');
  });
});

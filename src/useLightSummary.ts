import { useStore } from '@hakit/core';
export const rooms = [
  { name: 'Living Room', lights: ['light.light_living_room_bulbs', 'light.living_room_led_strip'] },
  { name: 'Bedroom', lights: ['light.light_bedroom', 'light.bedroom_closet'] },
  { name: 'Office', lights: ['light.office_bulbs', 'light.neon_light_led_strip'] },
  { name: 'Kitchen', lights: ['light.light_kitchen'] },
  { name: 'Gym', lights: ['light.gym'] },
  { name: 'Entry & laundry', lights: ['light.light_front_door', 'light.light_laundry_room'] },
  { name: 'Toilet', lights: ['light.light_toilet'] },
] as const;
export function useLightSummary() {
  return useStore(s => {
    if (!s.connection?.connected || s.connectionStatus !== 'connected') return 'Status unavailable';
    const states = rooms.flatMap(room => room.lights.map(id => s.entities[id]?.state));
    const on = states.filter(state => state === 'on').length;
    const missing = states.filter(state => state !== 'on' && state !== 'off').length;
    return `${on} light${on === 1 ? '' : 's'} on${missing ? ` · ${missing} unavailable` : ''}`;
  });
}

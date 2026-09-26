// Capability-only snapshot from Home Assistant, verified 2026-09-26.
// Preview readings are simulated; production reads live entity capabilities.
export const lightCapabilities: Record<string, Record<string, unknown>> = {
  'light.light_living_room_bulbs': { supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 166 },
  'light.living_room_led_strip': { supported_color_modes: ['hs'], color_mode: 'hs', brightness: 166, rgb_color: [240, 180, 120] },
  'light.light_bedroom': {
    supported_color_modes: ['color_temp'],
    color_mode: 'color_temp',
    brightness: 166,
    color_temp_kelvin: 3000,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6535,
  },
  'light.bedroom_closet': { supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 166 },
  'light.office_bulbs': {
    supported_color_modes: ['color_temp'],
    color_mode: 'color_temp',
    brightness: 166,
    color_temp_kelvin: 3000,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6535,
  },
  'light.neon_light_led_strip': { supported_color_modes: ['rgb'], color_mode: 'rgb', brightness: 166, rgb_color: [240, 180, 120] },
  'light.light_kitchen': { supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 166 },
  'light.gym': { supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 166 },
  'light.light_front_door': {
    supported_color_modes: ['color_temp'],
    color_mode: 'color_temp',
    brightness: 166,
    color_temp_kelvin: 3000,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6535,
  },
  'light.light_laundry_room': { supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 166 },
  'light.light_toilet': {
    supported_color_modes: ['color_temp'],
    color_mode: 'color_temp',
    brightness: 166,
    color_temp_kelvin: 3000,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6535,
  },
};

// Dashboard labels only: Home Assistant names and entity IDs remain unchanged.
const aliases: Record<string, string> = {
  'light.light_living_room_bulbs': 'Bulbs',
  'light.living_room_led_strip': 'LED strip',
  'light.light_bedroom': 'Main light',
  'light.bedroom_closet': 'Closet',
  'light.office_bulbs': 'Bulbs',
  'light.neon_light_led_strip': 'Neon strip',
  'light.light_kitchen': 'Main light',
  'light.gym': 'Main light',
  'light.light_front_door': 'Front door',
  'light.light_laundry_room': 'Laundry',
  'light.light_toilet': 'Main light',
};

export function lightLabel(id: string, fullName: string, room: string): string {
  if (aliases[id]) return aliases[id];
  const original = fullName.trim() || (id.split('.')[1] ?? id).replace(/_/g, ' ');
  let label = original.replace(/^light[ _-]+/i, '');
  if (label.toLowerCase().startsWith(room.toLowerCase()) && /^[ _-]/.test(label.slice(room.length))) {
    label = label.slice(room.length).replace(/^[ _-]+/, '');
  }
  label = label.trim() || original || 'Light';
  return (label[0].toUpperCase() + label.slice(1)).replace(/\bled\b/gi, 'LED');
}

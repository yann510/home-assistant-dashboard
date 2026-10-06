import type { CanvasRoute } from './routes';
import { readRoombaBattery } from './activity';

type HealthEntity = { state: string; last_changed?: string; attributes?: Record<string, unknown> };
export type DeviceHealthCard = { id: string; title: string; detail: string; route?: CanvasRoute };

// Verified, always-on devices only. Battery-powered and backend-monitored devices
// deliberately stay with the existing attention integration.
const devices: { id: string; name: string; route?: CanvasRoute }[] = [
  ...['gym', 'bedroom', 'living_room', 'bathroom'].map(room => ({
    id: `media_player.${room}`,
    name: `${room === 'living_room' ? 'Living room' : room[0].toUpperCase() + room.slice(1)} speaker`,
    route: { kind: 'speakers' } as CanvasRoute,
  })),
  { id: 'binary_sensor.aqara_fp2_bathroom_presence_sensor_1', name: 'Bathroom presence sensor' },
  { id: 'binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_1', name: 'Presence sensor' },
  ...Object.entries({
    office_bulbs: 'Office lights',
    light_bedroom: 'Bedroom lights',
    living_room_led_strip: 'Living room LED strip',
    light_living_room_bulbs: 'Living room lights',
    light_front_door: 'Front door light',
    light_toilet: 'Bathroom light',
    light_laundry_room: 'Laundry room light',
    light_kitchen: 'Kitchen lights',
    neon_light_led_strip: 'Neon light',
    bedroom_closet: 'Bedroom closet light',
    gym: 'Gym light',
  }).map(([id, name]) => ({ id: `light.${id}`, name, route: { kind: 'light', entityId: `light.${id}` } as CanvasRoute })),
  { id: 'switch.switch_bedroom_lamp', name: 'Bedroom lamp' },
  { id: 'switch.switch_office', name: 'Office switch' },
  { id: 'remote.broadlink_rm4_remote_control_ir_rf', name: 'Broadlink remote' },
];

export function selectDeviceHealth(
  entities: Record<string, HealthEntity | undefined>,
  now: number,
  connected: boolean
): DeviceHealthCard[] {
  if (!connected || !Number.isFinite(now)) return [];
  const cards: DeviceHealthCard[] = [];
  for (const device of devices) {
    const entity = entities[device.id];
    if (!entity || entity.attributes?.restored === true || !['unavailable', 'unknown'].includes(entity.state)) continue;
    const changed = Date.parse(entity.last_changed ?? '');
    if (!Number.isFinite(changed) || changed > now || now - changed < 10 * 60_000) continue;
    cards.push({
      id: device.id,
      title: `${device.name} ${entity.state === 'unknown' ? 'status unavailable' : 'offline'}`,
      detail: entity.state === 'unknown' ? 'Reliable status missing for at least 10 min' : 'Unavailable for at least 10 min',
      route: device.route,
    });
  }
  const vacuum = entities['vacuum.roomba'];
  const battery = readRoombaBattery(entities);
  if (
    vacuum &&
    vacuum.attributes?.restored !== true &&
    entities['sensor.roomba_battery_level']?.attributes?.restored !== true &&
    entities['binary_sensor.roomba_charging']?.attributes?.restored !== true &&
    entities['binary_sensor.roomba_charging']?.state === 'off' &&
    ['cleaning', 'paused', 'idle'].includes(vacuum.state) &&
    typeof battery === 'number' &&
    Number.isFinite(battery) &&
    battery >= 0 &&
    battery <= 20
  ) {
    cards.push({
      id: 'roomba-charge',
      title: 'Roomba battery low',
      detail: `Battery ${battery}% · Return to dock to charge`,
      route: { kind: 'vacuum' },
    });
  }
  const tabletBattery = entities['sensor.kftrwi_battery_level'];
  const tabletCharge = entities['sensor.kftrwi_charger_type'];
  const tabletState = entities['sensor.kftrwi_battery_state'];
  const tabletPercent = tabletBattery?.state.trim() ? Number(tabletBattery.state) : NaN;
  if (
    tabletBattery &&
    tabletCharge &&
    tabletState &&
    ![tabletBattery, tabletCharge, tabletState].some(entity => entity.attributes?.restored === true) &&
    Number.isFinite(tabletPercent) &&
    tabletPercent >= 0 &&
    tabletPercent <= 20 &&
    tabletCharge.state === 'none' &&
    ['discharging', 'not_charging'].includes(tabletState.state)
  ) {
    cards.push({
      id: 'dashboard-tablet-charge',
      title: 'Dashboard tablet battery low',
      detail: `Battery ${tabletPercent}% · Plug in the dashboard tablet`,
    });
  }
  return cards;
}

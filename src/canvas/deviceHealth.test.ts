import { describe, expect, it } from 'vitest';
import { selectDeviceHealth } from './deviceHealth';

const now = Date.parse('2026-10-06T16:00:00Z');
const offline = { state: 'unavailable', last_changed: new Date(now - 600_000).toISOString() };

describe('curated device health', () => {
  it('waits ten minutes and recovers immediately without scanning unrelated sensors', () => {
    const entities = { 'media_player.gym': offline, 'sensor.orphan': offline };
    expect(selectDeviceHealth(entities, now - 1, true)).toEqual([]);
    expect(selectDeviceHealth(entities, now, true)).toEqual([
      { id: 'media_player.gym', title: 'Gym speaker offline', detail: 'Unavailable for at least 10 min', route: { kind: 'speakers' } },
    ]);
    expect(selectDeviceHealth({ ...entities, 'media_player.gym': { ...offline, state: 'idle' } }, now, true)).toEqual([]);
  });

  it('recognizes each verified device family and selects useful navigation', () => {
    const cards = selectDeviceHealth(
      {
        'light.office_bulbs': offline,
        'switch.switch_bedroom_lamp': { ...offline, state: 'unknown' },
        'binary_sensor.aqara_fp2_bathroom_presence_sensor_1': offline,
        'remote.broadlink_rm4_remote_control_ir_rf': offline,
      },
      now,
      true
    );
    expect(cards.map(card => card.route)).toEqual([undefined, { kind: 'light', entityId: 'light.office_bulbs' }, undefined, undefined]);
  });

  it.each([undefined, '', 'invalid', new Date(now + 1).toISOString()])(
    'does not confirm an offline device with invalid or future last_changed: %s',
    last_changed => {
      expect(selectDeviceHealth({ 'light.gym': { state: 'unavailable', last_changed } }, now, true)).toEqual([]);
    }
  );

  it.each(['off', 'on', 'idle', 'paused', 'playing'])('treats ordinary %s states as healthy', state => {
    expect(selectDeviceHealth({ 'media_player.gym': { ...offline, state }, 'light.gym': { ...offline, state } }, now, true)).toEqual([]);
  });

  it('omits absent devices, secondary FP2 zones and backend-covered entities', () => {
    expect(
      selectDeviceHealth(
        { 'climate.office': offline, 'binary_sensor.aqara_fp2_bathroom_presence_sensor_2': offline, 'vacuum.roomba': offline },
        now,
        true
      )
    ).toEqual([]);
  });

  it.each(['idle', 'paused', 'cleaning'])('shows valid <=20 percent battery when Roomba is %s away from dock', state => {
    expect(
      selectDeviceHealth(
        { 'vacuum.roomba': { state }, 'sensor.roomba_battery_level': { state: '20' }, 'binary_sensor.roomba_charging': { state: 'off' } },
        now,
        true
      )[0]
    ).toMatchObject({
      title: 'Roomba battery low',
      detail: 'Battery 20% · Return to dock to charge',
      route: { kind: 'vacuum' },
    });
  });

  it.each(['docked', 'returning', 'unknown', 'unavailable', 'error', '', 'unexpected'])(
    'does not show charging advice with Roomba state %s',
    state => {
      expect(
        selectDeviceHealth(
          { 'vacuum.roomba': { state, attributes: { battery_level: 10 } }, 'binary_sensor.roomba_charging': { state: 'off' } },
          now,
          true
        )
      ).toEqual([]);
    }
  );

  it.each([undefined, null, '20', NaN, Infinity, -1, 20.1, 101])('rejects invalid or sufficient battery %s', battery_level => {
    expect(
      selectDeviceHealth(
        { 'vacuum.roomba': { state: 'idle', attributes: { battery_level } }, 'binary_sensor.roomba_charging': { state: 'off' } },
        now,
        true
      )
    ).toEqual([]);
  });

  it.each(['on', 'unknown', 'unavailable', undefined])('requires explicit charging off, rejects %s', state => {
    expect(
      selectDeviceHealth(
        {
          'vacuum.roomba': { state: 'idle', attributes: { battery_level: 10 } },
          'binary_sensor.roomba_charging': state ? { state } : undefined,
        },
        now,
        true
      )
    ).toEqual([]);
  });

  it('ignores restored orphan entities', () => {
    expect(selectDeviceHealth({ 'media_player.gym': { ...offline, attributes: { restored: true } } }, now, true)).toEqual([]);
  });

  it.each(['sensor.roomba_battery_level', 'binary_sensor.roomba_charging'])('ignores restored Roomba sensor %s', id => {
    const entities = {
      'vacuum.roomba': { state: 'idle' },
      'sensor.roomba_battery_level': { state: '10', attributes: {} },
      'binary_sensor.roomba_charging': { state: 'off', attributes: {} },
    };
    entities[id as 'sensor.roomba_battery_level' | 'binary_sensor.roomba_charging'].attributes = { restored: true };
    expect(selectDeviceHealth(entities, now, true)).toEqual([]);
  });

  it('never uses cached health data while disconnected', () => {
    expect(
      selectDeviceHealth({ 'media_player.gym': offline, 'vacuum.roomba': { state: 'idle', attributes: { battery_level: 0 } } }, now, false)
    ).toEqual([]);
  });
});

describe('dashboard tablet charge guidance', () => {
  const tablet = {
    'sensor.kftrwi_battery_level': { state: '20' },
    'sensor.kftrwi_battery_state': { state: 'discharging' },
    'sensor.kftrwi_charger_type': { state: 'none' },
  };
  it('shows charge guidance without an unrelated navigation target', () => {
    expect(selectDeviceHealth(tablet, now, true)).toEqual([
      { id: 'dashboard-tablet-charge', title: 'Dashboard tablet battery low', detail: 'Battery 20% · Plug in the dashboard tablet' },
    ]);
    expect(selectDeviceHealth({ ...tablet, 'sensor.kftrwi_battery_state': { state: 'not_charging' } }, now, true)).toHaveLength(1);
  });
  it.each(['unknown', 'unavailable', '', '-1', '21', '101', 'NaN', 'Infinity'])(
    'rejects invalid or sufficient tablet battery %s',
    state => {
      expect(selectDeviceHealth({ ...tablet, 'sensor.kftrwi_battery_level': { state } }, now, true)).toEqual([]);
    }
  );
  it.each(['ac', 'usb', 'wireless', 'unknown', 'unavailable', ''])('does not request charging with charger %s', state => {
    expect(selectDeviceHealth({ ...tablet, 'sensor.kftrwi_charger_type': { state } }, now, true)).toEqual([]);
  });
  it.each(['charging', 'full', 'unknown', 'unavailable', ''])('does not request charging with battery status %s', state => {
    expect(selectDeviceHealth({ ...tablet, 'sensor.kftrwi_battery_state': { state } }, now, true)).toEqual([]);
  });
  it('ignores missing, restored and disconnected tablet readings', () => {
    expect(selectDeviceHealth({ 'sensor.kftrwi_battery_level': { state: '10' } }, now, true)).toEqual([]);
    expect(
      selectDeviceHealth({ ...tablet, 'sensor.kftrwi_battery_level': { state: '10', attributes: { restored: true } } }, now, true)
    ).toEqual([]);
    expect(selectDeviceHealth(tablet, now, false)).toEqual([]);
  });
});

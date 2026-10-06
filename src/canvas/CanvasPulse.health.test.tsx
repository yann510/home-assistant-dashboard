// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasPulse, type AttentionController } from './CanvasPulse';

const store = vi.hoisted(() => ({
  entities: {} as Record<string, { state: string; last_changed?: string; attributes: Record<string, unknown> }>,
}));
vi.mock('@hakit/core', () => ({ useStore: (select: (state: typeof store) => unknown) => select(store) }));
afterEach(() => {
  cleanup();
  store.entities = {};
});

function controller(connected = true): AttentionController {
  return {
    connected,
    ready: true,
    items: [],
    now: Date.now(),
    error: null,
    busy: false,
    onAction: vi.fn(),
  } as unknown as AttentionController;
}

it('shows supplemental cards, navigates without selecting backend reminders, and clears on recovery/disconnection', () => {
  store.entities = {
    'media_player.gym': { state: 'unavailable', last_changed: new Date(Date.now() - 660_000).toISOString(), attributes: {} },
  };
  const attention = controller();
  const onOpen = vi.fn();
  const onSelect = vi.fn();
  const props = { attention, onOpen, onSelect };
  const view = render(<CanvasPulse {...props} />);
  const card = screen.getByRole('button', { name: 'View: Gym speaker offline' });
  expect(card.classList.contains('canvas-pulse__notice')).toBe(true);
  expect(screen.queryByText('All quiet at home.')).toBeNull();
  fireEvent.click(card);
  expect(onSelect).toHaveBeenCalledWith(null);
  expect(onOpen).toHaveBeenCalledWith({ kind: 'speakers' }, card);
  expect(attention.onAction).not.toHaveBeenCalled();
  view.rerender(<CanvasPulse {...props} attention={controller(false)} />);
  expect(screen.queryByRole('button', { name: 'View: Gym speaker offline' })).toBeNull();
  store.entities['media_player.gym'].state = 'idle';
  view.rerender(<CanvasPulse {...props} />);
  expect(screen.queryByRole('button', { name: 'View: Gym speaker offline' })).toBeNull();
});

it('opens vacuum controls from low battery guidance and does not duplicate unavailable Roomba', () => {
  store.entities = {
    'vacuum.roomba': { state: 'idle', attributes: {} },
    'sensor.roomba_battery_level': { state: '10', attributes: {} },
    'binary_sensor.roomba_charging': { state: 'off', attributes: {} },
  };
  const onOpen = vi.fn();
  const props = { attention: controller(), onOpen, onSelect: vi.fn() };
  const view = render(<CanvasPulse {...props} />);
  const charge = screen.getByRole('button', { name: 'View: Roomba battery low' });
  fireEvent.click(charge);
  expect(onOpen).toHaveBeenCalledWith({ kind: 'vacuum' }, charge);
  store.entities['vacuum.roomba'].state = 'unavailable';
  view.rerender(<CanvasPulse {...props} />);
  expect(screen.queryByRole('button', { name: 'View: Roomba battery low' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Roomba Unavailable' })).toHaveLength(1);
});

it('shows tablet charge guidance as information without a fabricated action', () => {
  store.entities = {
    'sensor.kftrwi_battery_level': { state: '10', attributes: {} },
    'sensor.kftrwi_battery_state': { state: 'discharging', attributes: {} },
    'sensor.kftrwi_charger_type': { state: 'none', attributes: {} },
  };
  render(<CanvasPulse attention={controller()} onOpen={vi.fn()} onSelect={vi.fn()} />);
  expect(screen.getByText('Dashboard tablet battery low')).toBeTruthy();
  expect(screen.getByText('Battery 10% · Plug in the dashboard tablet')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Dashboard tablet/ })).toBeNull();
});

it.each([
  ['binary_sensor.aqara_fp2_bathroom_presence_sensor_1', 'Bathroom presence sensor'],
  ['binary_sensor.aqara_fp2_presence_motion_sensor_presence_sensor_1', 'Presence sensor'],
  ['remote.broadlink_rm4_remote_control_ir_rf', 'Broadlink remote'],
  ['switch.switch_bedroom_lamp', 'Bedroom lamp'],
  ['switch.switch_office', 'Office switch'],
])('keeps %s health informational when no relevant controls exist', (id, name) => {
  store.entities = { [id]: { state: 'unavailable', last_changed: new Date(Date.now() - 660_000).toISOString(), attributes: {} } };
  const onOpen = vi.fn();
  render(<CanvasPulse attention={controller()} onOpen={onOpen} onSelect={vi.fn()} />);
  const title = screen.getByText(`${name} offline`);
  expect(title.closest('.canvas-pulse__notice')?.tagName).toBe('DIV');
  expect(screen.queryByRole('button', { name: `View: ${name} offline` })).toBeNull();
  fireEvent.click(title);
  expect(onOpen).not.toHaveBeenCalled();
});

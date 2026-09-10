// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TemperatureCard } from './TemperatureCard';
const ha = vi.hoisted(() => ({
  connection: { connected: true, sendMessagePromise: vi.fn() },
  connectionStatus: 'connected',
  entities: {} as Record<string, { state: string; attributes: Record<string, unknown> }>,
}));
vi.mock('@hakit/core', () => ({
  useEntity: (id: string) => ha.entities[id] ?? null,
  useStore: Object.assign((select: (s: typeof ha) => unknown) => select(ha), { getState: () => ha }),
}));
beforeEach(() => {
  ha.connection.connected = true;
  ha.connection.sendMessagePromise.mockReset().mockResolvedValue({});
  ha.entities = {
    'climate.thermostat_office': {
      state: 'heat',
      attributes: {
        temperature: 20,
        current_temperature: 19,
        hvac_action: 'idle',
        min_temp: 5,
        max_temp: 30,
        target_temp_step: 0.5,
        supported_features: 1,
      },
    },
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('uses reported heating action rather than inferring it from temperatures', () => {
  render(<TemperatureCard />);
  expect(screen.getByText('Currently 19°C')).toBeTruthy();
  expect(screen.getByText('Idle')).toBeTruthy();
  expect(screen.queryByText('Heating')).toBeNull();
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
});
it('sends a bounded room-specific change and waits for state confirmation', async () => {
  vi.useFakeTimers();
  const v = render(<TemperatureCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Raise Office target temperature' }));
  expect(ha.connection.sendMessagePromise).toHaveBeenCalledWith({
    type: 'call_service',
    domain: 'climate',
    service: 'set_temperature',
    target: { entity_id: 'climate.thermostat_office' },
    service_data: { temperature: 20.5 },
  });
  expect(screen.getByRole('button', { name: 'Raise Office target temperature' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('Office target temperature').textContent).toBe('20°');
  ha.entities['climate.thermostat_office'].attributes.temperature = 20.5;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  v.rerender(<TemperatureCard />);
  expect(screen.getByLabelText('Office target temperature').textContent).toBe('20.5°');
  expect(screen.queryByText('Updating…')).toBeNull();
});
it('respects limits and disables controls on disconnect', () => {
  ha.entities['climate.thermostat_office'].attributes.temperature = 30;
  const v = render(<TemperatureCard />);
  expect(screen.getByRole('button', { name: 'Raise Office target temperature' }).hasAttribute('disabled')).toBe(true);
  ha.connection.connected = false;
  v.rerender(<TemperatureCard />);
  expect(screen.getAllByText('Unavailable')).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'Lower Office target temperature' }).hasAttribute('disabled')).toBe(true);
});
it('shows service errors without displaying an unconfirmed target', async () => {
  ha.connection.sendMessagePromise.mockRejectedValue(new Error('Device offline'));
  render(<TemperatureCard />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Raise Office target temperature' }));
  });
  expect(screen.getByRole('alert').textContent).toContain('Device offline');
  expect(screen.getByLabelText('Office target temperature').textContent).toBe('20°');
});
it('times out when the thermostat does not confirm the requested temperature', async () => {
  vi.useFakeTimers();
  render(<TemperatureCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Raise Office target temperature' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(screen.getByRole('alert').textContent).toContain('not confirmed');
});

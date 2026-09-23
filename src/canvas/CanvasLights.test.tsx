// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHaFixture } from './testing/haFixture';
import { CanvasLightsProvider } from './useCanvasLights';
import { CanvasAllLights, CanvasLights } from './CanvasLights';
import { CanvasLightDetails } from './CanvasLightDetails';
import { deferred } from './testing/haFixture';

const ref = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign((select: (state: ReturnType<typeof createHaFixture> extends { getState: () => infer T } ? T : never) => unknown) => ref.current!.useStore(select), {
    getState: () => ref.current!.getState(),
    subscribe: (listener: () => void) => ref.current!.subscribe(listener),
  }),
}));
beforeEach(() => { ref.current = createHaFixture(); });
afterEach(cleanup);

it('targets only available lights in the selected room and never sends a toggle', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 128, supported_color_modes: ['brightness'] });
  fixture.publish('light.living_room_led_strip', 'unavailable');
  render(<CanvasLightsProvider><CanvasLights onOpenAll={() => {}} /></CanvasLightsProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'Turn off Living Room lights' }));
  expect(fixture.calls).toEqual([{ type: 'call_service', domain: 'light', service: 'turn_off', target: { entity_id: ['light.light_living_room_bulbs'] }, service_data: {} }]);
});

it('keeps whole-house off inside All lights and targets the exact available inventory', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on');
  fixture.publish('light.light_kitchen', 'off');
  fixture.publish('light.gym', 'on');
  render(<CanvasLightsProvider><CanvasAllLights onOpenLight={() => {}} /></CanvasLightsProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'Turn off all lights' }));
  const calls = fixture.calls as { service: string; target: { entity_id: string[] } }[];
  expect(calls.filter(call => call.service === 'toggle')).toHaveLength(0);
  expect(calls.map(call => call.target.entity_id[0])).toEqual(['light.light_living_room_bulbs', 'light.gym']);
});

it('captures the selected room before the user switches rooms', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'off', { supported_color_modes: ['brightness'] });
  fixture.publish('light.light_kitchen', 'off', { supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(<CanvasLightsProvider><CanvasLights onOpenAll={() => {}} /></CanvasLightsProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'Turn on Living Room lights' }));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Lights room' }), 'Kitchen');
  expect((fixture.calls[0] as { target: { entity_id: string[] } }).target.entity_id).toEqual(['light.light_living_room_bulbs']);
  await act(async () => { ack.resolve({}); });
});

it('shows only reported detail capabilities and preserves a brightness draft during acknowledgement', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, rgb_color: [255, 255, 255], color_temp_kelvin: 3000,
    min_color_temp_kelvin: 2000, max_color_temp_kelvin: 5000, effect: 'None', effect_list: ['None', 'Pulse'],
    supported_color_modes: ['rgb', 'color_temp'] });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(<CanvasLightsProvider><CanvasLightDetails entityId='light.gym' /></CanvasLightsProvider>);
  expect(screen.getByRole('slider', { name: 'Light colour temperature' }).getAttribute('min')).toBe('2000');
  expect(screen.getByLabelText('Light colour')).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Light effect' })).toBeTruthy();
  fireEvent.change(screen.getByRole('slider', { name: 'Light brightness' }), { target: { value: '68' } });
  fireEvent.blur(screen.getByRole('slider', { name: 'Light brightness' }));
  expect(screen.getByText('68%')).toBeTruthy();
  await act(async () => { ack.resolve({}); });
  expect(screen.getByText('68%')).toBeTruthy();
  await act(async () => { fixture.publish('light.gym', 'on', { brightness: Math.round(68 * 255 / 100), supported_color_modes: ['rgb', 'color_temp'] }); });
  await waitFor(() => expect(screen.queryByText('68%')).toBeTruthy());
});

it('disables controls for unknown states and hides unsupported features', () => {
  ref.current!.publish('light.gym', 'unknown', { supported_color_modes: ['onoff'] });
  render(<CanvasLightsProvider><CanvasLightDetails entityId='light.gym' /></CanvasLightsProvider>);
  expect((screen.getByRole('button', { name: 'Turn on Gym' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('slider', { name: 'Light brightness' })).toBeNull();
  expect(screen.queryByLabelText('Light colour')).toBeNull();
});

it('uses reported Kelvin range and submits the chosen temperature', () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2200,
    max_color_temp_kelvin: 6500, color_temp_kelvin: 3000 });
  render(<CanvasLightsProvider><CanvasLightDetails entityId='light.gym' /></CanvasLightsProvider>);
  const slider = screen.getByRole('slider', { name: 'Light colour temperature' });
  expect(slider.getAttribute('max')).toBe('6500');
  fireEvent.change(slider, { target: { value: '4200' } });
  fireEvent.blur(slider);
  expect(fixture.calls[0]).toMatchObject({ service: 'turn_on', service_data: { color_temp_kelvin: 4200 },
    target: { entity_id: ['light.gym'] } });
});

it('reports partial all-off rejection per target without claiming the whole house is off', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on');
  fixture.publish('light.gym', 'on');
  fixture.respondWith(message => {
    const target = (message as { target: { entity_id: string[] } }).target.entity_id[0];
    return target === 'light.gym' ? Promise.reject(new Error('Gym denied')) : Promise.resolve({});
  });
  render(<CanvasLightsProvider><CanvasAllLights onOpenLight={() => {}} /></CanvasLightsProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'Turn off all lights' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('light.gym: Gym denied'));
  expect(screen.getByRole('button', { name: 'Turn off all lights' })).toBeTruthy();
});

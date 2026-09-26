// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHaFixture } from './testing/haFixture';
import { CanvasLightsProvider } from './useCanvasLights';
import { CanvasAllLights, CanvasLights } from './CanvasLights';
import { CanvasLightDetails } from './CanvasLightDetails';
import { deferred } from './testing/haFixture';

const ref = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign(
    (select: (state: ReturnType<typeof createHaFixture> extends { getState: () => infer T } ? T : never) => unknown) =>
      ref.current!.useStore(select),
    {
      getState: () => ref.current!.getState(),
      subscribe: (listener: () => void) => ref.current!.subscribe(listener),
    }
  ),
}));
beforeEach(() => {
  ref.current = createHaFixture();
});
afterEach(cleanup);

it('targets only available lights in the selected room and never sends a toggle', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 128, supported_color_modes: ['brightness'] });
  fixture.publish('light.living_room_led_strip', 'unavailable');
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Turn off Living Room lights' }));
  expect(fixture.calls).toEqual([
    {
      type: 'call_service',
      domain: 'light',
      service: 'turn_off',
      target: { entity_id: ['light.light_living_room_bulbs'] },
      service_data: {},
    },
  ]);
});

it('keeps whole-house off inside All lights and targets the exact available inventory', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on');
  fixture.publish('light.light_kitchen', 'off');
  fixture.publish('light.gym', 'on');
  render(
    <CanvasLightsProvider>
      <CanvasAllLights onOpenLight={() => {}} />
    </CanvasLightsProvider>
  );
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
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Turn on Living Room lights' }));
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  expect((fixture.calls[0] as { target: { entity_id: string[] } }).target.entity_id).toEqual(['light.light_living_room_bulbs']);
  await act(async () => {
    ack.resolve({});
  });
});

it('shows only reported detail capabilities and preserves a brightness draft during acknowledgement', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', {
    brightness: 100,
    rgb_color: [255, 255, 255],
    color_temp_kelvin: 3000,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 5000,
    effect: 'None',
    effect_list: ['None', 'Pulse'],
    supported_color_modes: ['rgb', 'color_temp'],
  });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  expect(screen.getByRole('slider', { name: 'Light colour temperature' }).getAttribute('min')).toBe('2000');
  expect(screen.getByLabelText('Light colour')).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Light effect' })).toBeTruthy();
  fireEvent.change(screen.getByRole('slider', { name: 'Light brightness' }), { target: { value: '68' } });
  fireEvent.blur(screen.getByRole('slider', { name: 'Light brightness' }));
  expect(screen.getByText('Proposed brightness 68%')).toBeTruthy();
  await act(async () => {
    ack.resolve({});
  });
  expect(screen.getByText('Proposed brightness 68%')).toBeTruthy();
  await act(async () => {
    fixture.publish('light.gym', 'on', { brightness: Math.round((68 * 255) / 100), supported_color_modes: ['rgb', 'color_temp'] });
  });
  await waitFor(() => expect(screen.getByText('Reported brightness 68%')).toBeTruthy());
});

it('disables controls for unknown states and hides unsupported features', () => {
  ref.current!.publish('light.gym', 'unknown', { supported_color_modes: ['onoff'] });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  expect((screen.getByRole('button', { name: 'Turn on Gym' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('slider', { name: 'Light brightness' })).toBeNull();
  expect(screen.queryByLabelText('Light colour')).toBeNull();
});

it('uses reported Kelvin range and submits the chosen temperature', () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', {
    supported_color_modes: ['color_temp'],
    min_color_temp_kelvin: 2200,
    max_color_temp_kelvin: 6500,
    color_temp_kelvin: 3000,
  });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Light colour temperature' });
  expect(slider.getAttribute('max')).toBe('6500');
  fireEvent.change(slider, { target: { value: '4200' } });
  fireEvent.blur(slider);
  expect(fixture.calls[0]).toMatchObject({
    service: 'turn_on',
    service_data: { color_temp_kelvin: 4200 },
    target: { entity_id: ['light.gym'] },
  });
});

it('reports partial all-off rejection per target without claiming the whole house is off', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on');
  fixture.publish('light.gym', 'on');
  fixture.respondWith(message => {
    const target = (message as { target: { entity_id: string[] } }).target.entity_id[0];
    return target === 'light.gym' ? Promise.reject(new Error('Gym denied')) : Promise.resolve({});
  });
  render(
    <CanvasLightsProvider>
      <CanvasAllLights onOpenLight={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Turn off all lights' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Gym: Gym denied'));
  expect(screen.getByRole('button', { name: 'Turn off all lights' })).toBeTruthy();
});

it('targets only the on member of a mixed room', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_bedroom', 'on');
  fixture.publish('light.bedroom_closet', 'off');
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Bedroom' }));
  await userEvent.click(screen.getByRole('button', { name: 'Turn off Bedroom lights' }));
  expect(fixture.calls).toMatchObject([{ service: 'turn_off', target: { entity_id: ['light.light_bedroom'] } }]);
});

it('keeps an earlier room failure visible while another room command is pending', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'off');
  fixture.publish('light.light_kitchen', 'off');
  const living = deferred();
  const kitchen = deferred();
  fixture.respondWith(message =>
    (message as { target: { entity_id: string[] } }).target.entity_id[0] === 'light.light_living_room_bulbs'
      ? living.promise
      : kitchen.promise
  );
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Turn on Living Room lights' }));
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  await userEvent.click(screen.getByRole('button', { name: 'Turn on Kitchen lights' }));
  await act(async () => {
    living.reject(new Error('Living denied'));
  });
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('1 light needs attention'));
  expect(screen.getByRole('button', { name: 'Updating Kitchen lights' }).getAttribute('aria-busy')).toBe('true');
  await act(async () => {
    kitchen.resolve({});
  });
});

it('disables room brightness when all dimmable lights are off and never turns them on', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'off', { brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Room brightness' });
  expect((slider as HTMLInputElement).disabled).toBe(true);
  fireEvent.change(slider, { target: { value: '68' } });
  fireEvent.blur(slider);
  expect(fixture.calls).toHaveLength(0);
  expect(slider.getAttribute('aria-busy')).toBe('false');
});

it('targets only currently-on dimmable lights when a room brightness drag ends', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_bedroom', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  fixture.publish('light.bedroom_closet', 'off', { brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Bedroom' }));
  const slider = screen.getByRole('slider', { name: 'Room brightness' });
  fireEvent.pointerDown(slider);
  fireEvent.change(slider, { target: { value: '68' } });
  await act(async () => fixture.publish('light.light_bedroom', 'off', { brightness: 100, supported_color_modes: ['brightness'] }));
  fireEvent.pointerUp(slider);
  expect(fixture.calls).toHaveLength(0);
});

it.each(['pointerCancel', 'blur'])('cancels a room pointer brightness drag on %s', eventName => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Room brightness' });
  fireEvent.pointerDown(slider);
  fireEvent.change(slider, { target: { value: '68' } });
  if (eventName === 'pointerCancel') fireEvent.pointerCancel(slider);
  else fireEvent.blur(slider);
  fireEvent.blur(slider);
  fireEvent.pointerUp(slider);
  expect(fixture.calls).toHaveLength(0);
});

it('cancels a detail pointer brightness drag without a write', () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Light brightness' });
  fireEvent.pointerDown(slider);
  fireEvent.change(slider, { target: { value: '68' } });
  fireEvent.pointerCancel(slider);
  fireEvent.blur(slider);
  fireEvent.pointerUp(slider);
  expect(fixture.calls).toHaveLength(0);
});

it('labels unknown room brightness as a proposal and follows later readings after confirmation', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Room brightness' });
  expect(screen.queryByText('Current room brightness unknown')).toBeNull();
  expect(screen.getByRole('status', { name: 'Proposed brightness' }).textContent).toBe('—');
  expect(slider.getAttribute('aria-valuetext')).toContain('current room brightness unknown');
  fireEvent.change(slider, { target: { value: '68' } });
  fireEvent.blur(slider);
  await act(async () => {
    fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 173, supported_color_modes: ['brightness'] });
  });
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Proposed brightness' })).toBeNull());
  await act(async () => {
    fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 80, supported_color_modes: ['brightness'] });
  });
  expect(screen.getByRole('status', { name: 'Reported brightness' }).textContent).toBe('31%');
});

it.each([
  {
    name: 'brightness',
    attributes: { brightness: 100, supported_color_modes: ['brightness'] },
    choose: () => {
      const input = screen.getByRole('slider', { name: 'Light brightness' });
      fireEvent.change(input, { target: { value: '68' } });
      fireEvent.blur(input);
    },
    retained: { brightness: 173, supported_color_modes: ['brightness'] },
  },
  {
    name: 'temperature',
    attributes: {
      color_temp_kelvin: 3000,
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 5000,
      supported_color_modes: ['color_temp'],
    },
    choose: () => {
      const input = screen.getByRole('slider', { name: 'Light colour temperature' });
      fireEvent.change(input, { target: { value: '4200' } });
      fireEvent.blur(input);
    },
    retained: { color_temp_kelvin: 4200, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 5000, supported_color_modes: ['color_temp'] },
  },
  {
    name: 'colour',
    attributes: { rgb_color: [255, 0, 0], supported_color_modes: ['rgb'] },
    choose: () => {
      fireEvent.change(screen.getByLabelText('Light colour'), { target: { value: '#0000ff' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply colour' }));
    },
    retained: { rgb_color: [0, 0, 255], supported_color_modes: ['rgb'] },
  },
  {
    name: 'effect',
    attributes: { effect: 'None', effect_list: ['None', 'Pulse'], supported_color_modes: ['brightness'] },
    choose: () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Light effect' }), { target: { value: 'Pulse' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply effect' }));
    },
    retained: { effect: 'Pulse', effect_list: ['None', 'Pulse'], supported_color_modes: ['brightness'] },
  },
])('does not observe $name from retained attributes while off', async ({ attributes, choose, retained }) => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'off', attributes);
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  choose();
  await screen.findByText('Service accepted; waiting for reported state.');
  await act(async () => {
    fixture.publish('light.gym', 'off', retained);
  });
  expect(screen.getByText('Service accepted; waiting for reported state.')).toBeTruthy();
});

it('labels missing readings as unknown and initial slider positions as proposals', () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', {
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 5000,
    supported_color_modes: ['rgb', 'color_temp'],
  });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  expect(screen.getByText('Current brightness unknown')).toBeTruthy();
  expect(screen.getByText('Current colour temperature unknown')).toBeTruthy();
  expect(screen.getByText('Current colour unknown')).toBeTruthy();
  expect(screen.getByText('Proposed brightness 50%')).toBeTruthy();
  expect(screen.getByText('Proposed colour temperature 3500 K')).toBeTruthy();
  expect(screen.getByText('Proposed colour #ffffff')).toBeTruthy();
  expect(screen.getByRole('slider', { name: 'Light brightness' }).getAttribute('aria-valuetext')).toContain('proposed');
});

it('clears an observed brightness draft so later telemetry updates the display', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Light brightness' });
  fireEvent.change(slider, { target: { value: '68' } });
  fireEvent.blur(slider);
  await act(async () => {
    fixture.publish('light.gym', 'on', { brightness: 173, supported_color_modes: ['brightness'] });
  });
  await waitFor(() => expect(screen.queryByText('Proposed brightness 68%')).toBeNull());
  await act(async () => {
    fixture.publish('light.gym', 'on', { brightness: 80, supported_color_modes: ['brightness'] });
  });
  expect(screen.getByText('Reported brightness 31%')).toBeTruthy();
});

it('keeps compact command progress in the power control and removes success feedback', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'off', { supported_color_modes: ['brightness'] });
  fixture.publish('light.light_kitchen', 'off', { supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Turn on Living Room lights' }));
  expect(screen.getByRole('button', { name: 'Updating Living Room lights' }).getAttribute('aria-busy')).toBe('true');
  expect(screen.queryByText(/Sending to|Sent; waiting|reported the requested state/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  expect(screen.getByRole('button', { name: 'Turn on Kitchen lights' }).getAttribute('aria-busy')).toBe('false');
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Living Room' }));
  expect(screen.getByRole('button', { name: 'Updating Living Room lights' })).toBeTruthy();
  await act(async () => {
    ack.resolve({});
  });
  expect(screen.getByRole('button', { name: 'Updating Living Room lights' })).toBeTruthy();
  await act(async () => {
    fixture.publish('light.light_living_room_bulbs', 'on', { supported_color_modes: ['brightness'] });
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Turn off Living Room lights' }).getAttribute('aria-busy')).toBe('false'));
  expect(screen.queryByText(/Sending to|Sent; waiting|reported the requested state/)).toBeNull();
});

it('retains compact errors while suppressing normal command feedback', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on');
  fixture.respondWith(() => Promise.reject(new Error('Unavailable service')));
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Turn off Living Room lights' }));
  expect((await screen.findByRole('alert')).textContent).toContain('needs attention');
  expect(screen.queryByText(/Sending to|Sent; waiting|reported the requested state/)).toBeNull();
});

it('shows brightness progress in place while retaining proposed and reported readings', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 128, supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Room brightness' });
  fireEvent.change(slider, { target: { value: '70' } });
  fireEvent.blur(slider);
  expect(slider.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByText('Updating…')).toBeTruthy();
  expect(screen.getByLabelText('Proposed brightness').textContent).toBe('70%');
  expect(screen.getByRole('button', { name: 'Turn off Living Room lights' }).getAttribute('aria-busy')).toBe('false');
  await act(async () => {
    ack.resolve({});
  });
  await act(async () => {
    fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 179, supported_color_modes: ['brightness'] });
  });
  await waitFor(() => expect(slider.getAttribute('aria-busy')).toBe('false'));
  expect(screen.getByLabelText('Reported brightness').textContent).toBe('70%');
  expect(screen.queryByText(/reported the requested state/)).toBeNull();
});

it('retains a pending brightness proposal across room switches until its room confirms', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 128, supported_color_modes: ['brightness'] });
  fixture.publish('light.light_kitchen', 'on', { brightness: 80, supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const slider = () => screen.getByRole('slider', { name: 'Room brightness' });
  fireEvent.change(slider(), { target: { value: '70' } });
  fireEvent.blur(slider());
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  expect(slider().getAttribute('aria-busy')).toBe('false');
  expect(screen.getByLabelText('Reported brightness').textContent).toBe('31%');
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Living Room' }));
  expect(slider().getAttribute('aria-busy')).toBe('true');
  expect(screen.getByLabelText('Proposed brightness').textContent).toBe('70%');
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  await act(async () => {
    ack.resolve({});
  });
  await act(async () => {
    fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 179, supported_color_modes: ['brightness'] });
  });
  expect(screen.getByLabelText('Reported brightness').textContent).toBe('31%');
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Living Room' }));
  await waitFor(() => expect(slider().getAttribute('aria-busy')).toBe('false'));
  expect(screen.getByLabelText('Reported brightness').textContent).toBe('70%');
});

it('supports keyboard room selection and returns focus after selection and Escape', async () => {
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const trigger = screen.getByRole('button', { name: 'Lights room' });
  trigger.focus();
  await userEvent.keyboard('{ArrowDown}');
  const menu = screen.getByRole('listbox', { name: 'Lights room' });
  expect(document.activeElement).toBe(menu);
  expect(screen.getByRole('option', { name: 'Living Room' }).getAttribute('aria-selected')).toBe('true');
  await userEvent.keyboard('{End}{Enter}');
  expect(trigger.textContent).toContain('Toilet');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await userEvent.keyboard('{Enter}{Home}{ArrowDown}{Enter}');
  expect(trigger.textContent).toContain('Bedroom');
  await userEvent.keyboard('{Enter}{End}{Escape}');
  expect(trigger.textContent).toContain('Bedroom');
  expect(document.activeElement).toBe(trigger);
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('dismisses the room popup on its backdrop and traps Tab within the modal', async () => {
  ref.current!.publish('light.light_living_room_bulbs', 'on');
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const trigger = screen.getByRole('button', { name: 'Lights room' });
  await userEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Choose a room' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  await userEvent.click(dialog.parentElement!);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await userEvent.click(trigger);
  await userEvent.tab();
  const close = screen.getByRole('button', { name: 'Close details' });
  expect(document.activeElement).toBe(close);
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole('listbox'));
  await userEvent.tab({ shift: true });
  expect(document.activeElement).toBe(close);
  await userEvent.click(close);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('shows live room counts and selects a tile without sending light commands', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on');
  fixture.publish('light.living_room_led_strip', 'off');
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const trigger = screen.getByRole('button', { name: 'Lights room' });
  await userEvent.click(trigger);
  const living = screen.getByRole('option', { name: 'Living Room' });
  expect(living.textContent).toBe('Living Room1 on');
  expect(living.getAttribute('aria-selected')).toBe('true');
  expect(living.querySelector('.canvas-room-artwork')).not.toBeNull();
  await act(async () => fixture.publish('light.living_room_led_strip', 'on'));
  expect(living.textContent).toBe('Living Room2 on');
  await userEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  expect(trigger.textContent).toContain('Kitchen');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(fixture.calls).toEqual([]);
  await userEvent.click(trigger);
  expect(screen.getByRole('option', { name: 'Kitchen' }).getAttribute('aria-selected')).toBe('true');
});

it('returns to the room trigger when pointer activation did not focus it', async () => {
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  screen.getByRole('button', { name: /All lights/ }).focus();
  const trigger = screen.getByRole('button', { name: 'Lights room' });
  // Unlike userEvent.click, this mirrors browsers that do not focus a tapped button.
  fireEvent.click(trigger);
  await userEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  expect(document.activeElement).toBe(trigger);
});

it.each([2, 3])('moves by the rendered %s-column room grid with arrow keys', async columns => {
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  const grid = screen.getByRole('listbox');
  grid.style.gridTemplateColumns = Array(columns).fill('100px').join(' ');
  const options = screen.getAllByRole('option');
  await userEvent.keyboard('{ArrowDown}');
  expect(grid.getAttribute('aria-activedescendant')).toBe(options[columns].id);
  await userEvent.keyboard('{ArrowRight}');
  expect(grid.getAttribute('aria-activedescendant')).toBe(options[columns + 1].id);
  await userEvent.keyboard('{ArrowUp}{ArrowLeft}');
  expect(grid.getAttribute('aria-activedescendant')).toBe(options[0].id);
  expect(ref.current!.calls).toEqual([]);
});

it('distinguishes unavailable and disconnected room counts from lights reported off', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'off');
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  expect(screen.getByRole('option', { name: 'Living Room' }).textContent).toBe('Living Room0 on · 1 unavailable');
  expect(screen.getByRole('option', { name: 'Kitchen' }).textContent).toBe('KitchenUnavailable');
  await act(async () => fixture.disconnect());
  for (const tile of screen.getAllByRole('option')) expect(tile.textContent).toContain('Reconnecting…');
  expect(fixture.calls).toEqual([]);
});

it('toggles one quick light only and opens its separate settings without a power command', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', {
    friendly_name: 'Ceiling',
    brightness: 128,
    supported_color_modes: ['brightness'],
  });
  fixture.publish('light.living_room_led_strip', 'on', {
    friendly_name: 'LED strip',
    brightness: 128,
    supported_color_modes: ['brightness'],
  });
  const onOpenLight = vi.fn();
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} onOpenLight={onOpenLight} />
    </CanvasLightsProvider>
  );
  const settings = screen.getByRole('button', { name: 'LED strip settings' });
  await userEvent.click(settings);
  expect(onOpenLight).toHaveBeenCalledWith('light.living_room_led_strip', settings);
  expect(fixture.calls).toHaveLength(0);
  const toggle = screen.getByRole('button', { name: 'Turn off Ceiling' });
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  await userEvent.click(toggle);
  expect(fixture.calls).toEqual([
    expect.objectContaining({ service: 'turn_off', target: { entity_id: ['light.light_living_room_bulbs'] } }),
  ]);
  expect(toggle.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('button', { name: 'Turn off LED strip' }).getAttribute('aria-busy')).toBe('false');
});

it('shows Mixed for different reported on-light levels until the user chooses a common brightness', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 51, supported_color_modes: ['brightness'] });
  fixture.publish('light.living_room_led_strip', 'on', { brightness: 204, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Room brightness' });
  expect(screen.getByLabelText('Mixed brightness').textContent).toBe('Mixed');
  expect(slider.getAttribute('aria-valuetext')).toContain('Mixed brightness');
  expect(slider.getAttribute('aria-valuetext')).toContain('adjust lights that are on');
  fireEvent.change(slider, { target: { value: '60' } });
  expect(screen.getByLabelText('Proposed brightness').textContent).toBe('60%');
  expect(slider.getAttribute('aria-valuetext')).toContain('proposed 60 percent');
  fireEvent.blur(slider);
  expect(fixture.calls).toEqual(
    ['light.light_living_room_bulbs', 'light.living_room_led_strip'].map(id =>
      expect.objectContaining({ target: { entity_id: [id] }, service_data: { brightness: 153 } })
    )
  );
  await act(async () => {
    fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 153, supported_color_modes: ['brightness'] });
    fixture.publish('light.living_room_led_strip', 'on', { brightness: 153, supported_color_modes: ['brightness'] });
  });
  await waitFor(() => expect(screen.getByLabelText('Reported brightness').textContent).toBe('60%'));
});

it('ignores off lights for Mixed and does not report a partial known brightness as uniform', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 51, supported_color_modes: ['brightness'] });
  fixture.publish('light.living_room_led_strip', 'off', { brightness: 204, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  expect(screen.getByLabelText('Reported brightness').textContent).toBe('20%');
  await act(async () => {
    fixture.publish('light.living_room_led_strip', 'on', { supported_color_modes: ['brightness'] });
  });
  expect(screen.queryByLabelText('Reported brightness')).toBeNull();
  expect(screen.getByLabelText('Proposed brightness').textContent).toBe('—');
});

it.each(['off', 'turned off before commit'])('changes brightness only on lights still on: %s', async scenario => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  fixture.publish('light.living_room_led_strip', scenario === 'off' ? 'off' : 'on', {
    brightness: 180,
    supported_color_modes: ['brightness'],
  });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Room brightness' });
  fireEvent.change(slider, { target: { value: '60' } });
  if (scenario !== 'off') {
    await act(async () =>
      fixture.publish('light.living_room_led_strip', 'off', { brightness: 180, supported_color_modes: ['brightness'] })
    );
  }
  fireEvent.blur(slider);
  expect(fixture.calls).toEqual([
    expect.objectContaining({
      service: 'turn_on',
      target: { entity_id: ['light.light_living_room_bulbs'] },
      service_data: { brightness: 153 },
    }),
  ]);
});

it('adjusts only the on dimmable lights of an expanded room and leaves other rooms alone', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 128, supported_color_modes: ['brightness'] });
  fixture.publish('light.living_room_led_strip', 'off', { supported_color_modes: ['brightness'] });
  fixture.publish('light.light_kitchen', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasAllLights onOpenLight={() => {}} />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Living Room brightness' });
  fireEvent.change(slider, { target: { value: '68' } });
  fireEvent.keyUp(slider, { key: 'ArrowRight' });
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  expect(fixture.calls[0]).toMatchObject({
    service: 'turn_on',
    target: { entity_id: ['light.light_living_room_bulbs'] },
    service_data: { brightness: 173 },
  });
  expect((slider as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('slider', { name: 'Kitchen brightness' }) as HTMLInputElement).disabled).toBe(false);
});

it('keeps every expanded room light controllable with settings available even when unavailable', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { friendly_name: 'Living bulbs' });
  fixture.publish('light.living_room_led_strip', 'unavailable', { friendly_name: 'Sofa strip' });
  const onOpenLight = vi.fn();
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      <CanvasAllLights onOpenLight={onOpenLight} />
    </CanvasLightsProvider>
  );
  const room = within(screen.getByRole('region', { name: 'Living Room lights' }));
  expect((room.getByRole('button', { name: 'Turn on Sofa strip' }) as HTMLButtonElement).disabled).toBe(true);
  const settings = room.getByRole('button', { name: 'Sofa strip settings' });
  await userEvent.click(settings);
  expect(onOpenLight).toHaveBeenCalledWith('light.living_room_led_strip', settings);
  await userEvent.click(room.getByRole('button', { name: 'Turn off Living bulbs' }));
  expect(fixture.calls[0]).toMatchObject({ service: 'turn_off', target: { entity_id: ['light.light_living_room_bulbs'] } });
  expect(room.getByRole('button', { name: 'Turn off Living bulbs' }).getAttribute('aria-busy')).toBe('true');
  expect((room.getByRole('button', { name: 'Turn off Living Room lights' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {
    fixture.publish('light.light_living_room_bulbs', 'off', { friendly_name: 'Living bulbs' });
    ack.resolve({});
  });
  await waitFor(() => expect(room.getByRole('button', { name: 'Turn on Living bulbs' }).getAttribute('aria-busy')).toBe('false'));
});

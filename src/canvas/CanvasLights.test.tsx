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
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
      <CanvasAllLights />
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
  expect(screen.getByRole('slider', { name: 'Colour wheel' })).toBeTruthy();
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
  expect(screen.queryByRole('slider', { name: 'Colour wheel' })).toBeNull();
});

it('uses reported Kelvin range and submits the chosen temperature', async () => {
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
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  expect(fixture.calls[0]).toMatchObject({
    service: 'turn_on',
    service_data: { color_temp_kelvin: 4200 },
    target: { entity_id: ['light.gym'] },
  });
});

it.each([false, true])('requires advertised temperature support in light details (embedded: %s)', embedded => {
  const fixture = ref.current!;
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' embedded={embedded} />
    </CanvasLightsProvider>
  );
  for (const modes of [undefined, [], ['onoff'], ['brightness'], ['rgb'], ['rgbww']]) {
    act(() =>
      fixture.publish('light.gym', 'on', {
        supported_color_modes: modes,
        color_mode: 'color_temp',
        color_temp_kelvin: 3000,
        min_color_temp_kelvin: 2000,
        max_color_temp_kelvin: 6500,
        min_mireds: 153,
        max_mireds: 500,
      })
    );
    expect(screen.queryByRole('button', { name: 'Warmth' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Light colour temperature' })).toBeNull();
  }
  expect(fixture.calls).toEqual([]);
});

it.each([false, true])('requires usable temperature bounds in light details (embedded: %s)', embedded => {
  const fixture = ref.current!;
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' embedded={embedded} />
    </CanvasLightsProvider>
  );
  for (const [min, max] of [
    [undefined, undefined],
    [2000, undefined],
    [0, 6500],
    [-100, 6500],
    [6500, 2000],
    [3000, 3000],
    [NaN, 6500],
    [2000, Infinity],
  ]) {
    for (const unit of ['kelvin', 'mired']) {
      act(() =>
        fixture.publish('light.gym', 'on', {
          supported_color_modes: ['color_temp'],
          ...(unit === 'kelvin' ? { min_color_temp_kelvin: min, max_color_temp_kelvin: max } : { min_mireds: min, max_mireds: max }),
        })
      );
      expect(screen.queryByRole('button', { name: 'Warmth' })).toBeNull();
      expect(screen.queryByRole('slider', { name: 'Light colour temperature' })).toBeNull();
    }
  }
  expect(fixture.calls).toEqual([]);
});

it('keeps warmth available in another current colour mode and falls back to valid legacy bounds', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', {
    supported_color_modes: ['rgb', 'color_temp'],
    color_mode: 'rgb',
    min_color_temp_kelvin: 6500,
    max_color_temp_kelvin: 2000,
    min_mireds: 153,
    max_mireds: 500,
  });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' embedded />
    </CanvasLightsProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Warmth' }));
  const slider = screen.getByRole('slider', { name: 'Light colour temperature' });
  expect(slider.getAttribute('min')).toBe('153');
  expect(slider.getAttribute('max')).toBe('500');
  fireEvent.change(slider, { target: { value: '300' } });
  fireEvent.blur(slider);
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  expect(fixture.calls[0]).toMatchObject({ service_data: { color_temp: 300 } });
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
      <CanvasAllLights />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Turn off all lights' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Gym · Main light: Gym denied'));
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

it('does not send another room brightness command when its last light turns off during a drag', async () => {
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
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
  });
  expect(fixture.calls).toHaveLength(0);
});

it.each(['pointerCancel', 'blur'])('keeps the live room brightness value on %s without an extra write', async eventName => {
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
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
});

it('keeps the live detail brightness value on pointer cancellation without an extra write', async () => {
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
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
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
    choose: async () => {
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Colour wheel' }), { key: 'End' });
      await waitFor(() =>
        expect((ref.current!.calls[ref.current!.calls.length - 1] as { service_data: unknown }).service_data).toEqual({
          rgb_color: [255, 0, 0],
        })
      );
    },
    retained: { rgb_color: [255, 0, 0], supported_color_modes: ['rgb'] },
  },
  {
    name: 'effect',
    attributes: { effect: 'None', effect_list: ['None', 'Pulse'], supported_color_modes: ['brightness'] },
    choose: () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Light effect' }), { target: { value: 'Pulse' } });
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
  await choose();
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
  expect(screen.getByRole('slider', { name: 'Colour wheel' }).getAttribute('aria-valuetext')).toContain('saturation 0 percent');
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

it('toggles one quick light only and opens its inline settings without a power command', async () => {
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
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const settings = screen.getByRole('button', { name: 'LED strip settings' });
  await userEvent.click(settings);
  expect(screen.getByRole('region', { name: /settings$/ })).toBeTruthy();
  expect(fixture.calls).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Close light settings' }));
  expect(document.activeElement).toBe(settings);
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
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
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

it('changes brightness only on lights that are on at input time', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  fixture.publish('light.living_room_led_strip', 'off', {
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
  fireEvent.blur(slider);
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
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
      <CanvasAllLights />
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
  expect((slider as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole('slider', { name: 'Kitchen brightness' }) as HTMLInputElement).disabled).toBe(false);
});

it('keeps every expanded room light controllable with settings available even when unavailable', async () => {
  const fixture = ref.current!;
  fixture.publish('light.light_living_room_bulbs', 'on', { friendly_name: 'Living bulbs' });
  fixture.publish('light.living_room_led_strip', 'unavailable', { friendly_name: 'Sofa strip' });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      <CanvasAllLights />
    </CanvasLightsProvider>
  );
  const room = within(screen.getByRole('region', { name: 'Living Room lights' }));
  expect((room.getByRole('button', { name: 'Turn on Sofa strip' }) as HTMLButtonElement).disabled).toBe(true);
  const settings = room.getByRole('button', { name: 'Sofa strip settings' });
  await userEvent.click(settings);
  expect(screen.getByRole('region', { name: /settings$/ })).toBeTruthy();
  expect(fixture.calls).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Close light settings' }));
  expect(document.activeElement).toBe(settings);
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

it('applies inline settings only to the chosen light and keeps reported changes after closing', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { friendly_name: 'Gym', brightness: 128, supported_color_modes: ['brightness'] });
  fixture.respondWith(async message => {
    const brightness = (message as { service_data: { brightness: number } }).service_data.brightness;
    fixture.publish('light.gym', 'on', { friendly_name: 'Gym', brightness, supported_color_modes: ['brightness'] });
    return {};
  });
  render(
    <CanvasLightsProvider>
      <CanvasAllLights />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Gym settings' }));
  const slider = screen.getByRole('slider', { name: 'Light brightness' });
  fireEvent.change(slider, { target: { value: '70' } });
  fireEvent.keyUp(slider, { key: 'ArrowRight' });
  await waitFor(() =>
    expect(screen.getByRole('slider', { name: 'Light brightness' }).getAttribute('aria-valuetext')).toBe('reported 70 percent')
  );
  expect(fixture.calls).toEqual([
    expect.objectContaining({
      service: 'turn_on',
      target: { entity_id: ['light.gym'] },
      service_data: { brightness: 179 },
    }),
  ]);
  await userEvent.click(screen.getByRole('button', { name: 'Close light settings' }));
  expect((screen.getByRole('slider', { name: 'Gym brightness' }) as HTMLInputElement).value).toBe('70');
  expect(fixture.calls).toHaveLength(1);
});

it('shows disabled unavailable light controls and replaces the active room overlay', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'unavailable', { friendly_name: 'Gym', supported_color_modes: ['brightness'] });
  fixture.publish('light.light_kitchen', 'on', { friendly_name: 'Kitchen', brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasAllLights />
    </CanvasLightsProvider>
  );
  await userEvent.click(screen.getByRole('button', { name: 'Gym settings' }));
  expect((screen.getByRole('slider', { name: 'Light brightness' }) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Turn on Gym' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Close light settings' }));
  await userEvent.click(screen.getByRole('button', { name: 'Kitchen settings' }));
  expect(screen.queryByRole('region', { name: 'Gym settings' })).toBeNull();
  expect(screen.getByRole('region', { name: 'Kitchen settings' })).toBeTruthy();
  expect((screen.getByRole('slider', { name: 'Light brightness' }) as HTMLInputElement).value).toBe('39');
  expect(fixture.calls).toEqual([]);
});

it('keeps a pending brightness command alive after closing inline settings', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { friendly_name: 'Gym', brightness: 128, supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      <CanvasAllLights />
    </CanvasLightsProvider>
  );
  const room = screen.getByRole('region', { name: 'Gym lights' });
  const trigger = within(room).getByRole('button', { name: 'Gym settings' });
  await userEvent.click(trigger);
  const slider = screen.getByRole('slider', { name: 'Light brightness' });
  fireEvent.change(slider, { target: { value: '70' } });
  fireEvent.keyUp(slider, { key: 'ArrowRight' });
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  await userEvent.click(screen.getByRole('button', { name: 'Close light settings' }));
  expect(document.activeElement).toBe(trigger);
  expect((within(room).getByRole('slider', { name: 'Gym brightness' }) as HTMLInputElement).disabled).toBe(false);
  await act(async () => {
    ack.resolve({});
    fixture.publish('light.gym', 'on', { friendly_name: 'Gym', brightness: 179, supported_color_modes: ['brightness'] });
  });
  expect(screen.getByRole('region', { name: 'Gym lights' })).toBe(room);
  await waitFor(() => expect((within(room).getByRole('slider', { name: 'Gym brightness' }) as HTMLInputElement).disabled).toBe(false));
  expect((within(room).getByRole('slider', { name: 'Gym brightness' }) as HTMLInputElement).value).toBe('70');
  expect(fixture.calls).toHaveLength(1);
});

it('shows only the chosen supported adjustment and debounces colour while applying effects immediately', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', {
    brightness: 128,
    supported_color_modes: ['rgb', 'color_temp'],
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6000,
    color_temp_kelvin: 3000,
    rgb_color: [255, 255, 255],
    effect_list: ['None', 'Pulse'],
  });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' embedded />
    </CanvasLightsProvider>
  );
  expect(screen.getByRole('slider', { name: 'Light brightness' })).toBeTruthy();
  expect(screen.queryByRole('slider', { name: 'Colour wheel' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Colour' }));
  expect(screen.queryByRole('slider', { name: 'Light brightness' })).toBeNull();
  expect(screen.getByRole('slider', { name: 'Colour wheel' })).toBeTruthy();
  const colour = screen.getByRole('slider', { name: 'Colour wheel' });
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.keyDown(colour, { key: 'End' });
  fireEvent.keyDown(colour, { key: 'ArrowRight', shiftKey: true });
  fireEvent.blur(colour);
  expect(fixture.calls).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Effect' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Pulse' } });
  expect(screen.queryByRole('slider', { name: 'Colour wheel' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Warmth' }));
  expect(screen.getByRole('slider', { name: 'Light colour temperature' })).toBeTruthy();
  expect(screen.queryByRole('combobox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Effect' }));
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Pulse');
  fireEvent.click(screen.getByRole('button', { name: 'Colour' }));
  expect(screen.getByRole('slider', { name: 'Colour wheel' }).getAttribute('aria-valuetext')).toBe(
    'Hue 10 degrees, saturation 100 percent'
  );
  expect(screen.queryAllByRole('button', { name: 'Apply' })).toHaveLength(0);
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(fixture.calls[1]).toMatchObject({ service_data: { rgb_color: [255, 42, 0] } });
  expect(fixture.calls[0]).toMatchObject({ service_data: { effect: 'Pulse' } });
});

it('omits unsupported adjustment choices and keeps missing brightness visibly unknown', () => {
  ref.current!.publish('light.gym', 'off', { supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' embedded />
    </CanvasLightsProvider>
  );
  expect(screen.getByRole('group', { name: 'Light adjustments' }).querySelectorAll('button')).toHaveLength(1);
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toContain('current brightness unknown');
});

it('shows compact dashboard labels while keeping the full name available in settings', async () => {
  const fullName = 'Smart WiFi music LED Strip Living Room Led Strip';
  ref.current!.publish('light.living_room_led_strip', 'on', { friendly_name: fullName });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  expect(screen.getByRole('button', { name: `Turn off ${fullName}` }).textContent).toBe('LED strip');
  await userEvent.click(screen.getByRole('button', { name: `${fullName} settings` }));
  expect(screen.getByRole('heading', { name: 'LED strip' })).toBeTruthy();
  const disclosure = screen.getByText('LED strip', { selector: 'h3' }).closest('details')!;
  expect(disclosure.open).toBe(false);
  await userEvent.click(disclosure.querySelector('summary')!);
  expect(disclosure.open).toBe(true);
  expect(disclosure.querySelector('p')?.textContent).toBe(fullName);
  expect(ref.current!.calls).toHaveLength(0);
});

it.each(['room', 'detail'])('debounces %s brightness input and keeps the final value while acknowledgement is pending', async kind => {
  const fixture = ref.current!;
  const id = kind === 'room' ? 'light.light_living_room_bulbs' : 'light.gym';
  fixture.publish(id, 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      {kind === 'room' ? <CanvasLights onOpenAll={() => {}} /> : <CanvasLightDetails entityId={id} />}
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: kind === 'room' ? 'Room brightness' : 'Light brightness' });
  fireEvent.input(slider, { target: { value: '55' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  expect(fixture.calls).toHaveLength(1);
  expect(slider).toHaveProperty('disabled', false);
  fireEvent.input(slider, { target: { value: '72' } });
  fireEvent.input(slider, { target: { value: '89' } });
  expect(fixture.calls).toHaveLength(1);
  await act(async () => {
    ack.resolve({});
  });
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(fixture.calls[1]).toMatchObject({ service_data: { brightness: 227 } });
  await act(async () => fixture.publish(id, 'on', { brightness: 227, supported_color_modes: ['brightness'] }));
  await waitFor(() => expect(slider.getAttribute('aria-valuetext')).toContain('reported 89 percent'));
});

it('debounces colour and sets effects immediately without an Apply button', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', {
    rgb_color: [255, 0, 0],
    supported_color_modes: ['rgb'],
    effect_list: ['None', 'Pulse'],
    effect: 'None',
  });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  expect(screen.queryAllByRole('button', { name: /Apply/ })).toHaveLength(0);
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Colour wheel' }), { key: 'ArrowRight', shiftKey: true });
  expect(fixture.calls).toHaveLength(0);
  fireEvent.change(screen.getByRole('combobox', { name: 'Light effect' }), { target: { value: 'Pulse' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(fixture.calls[0]).toMatchObject({ service_data: { effect: 'Pulse' } });
  expect(fixture.calls[1]).toMatchObject({ service_data: { rgb_color: [255, 42, 0] } });
});

it('does not replay queued light input across a socket reconnect with the same store connection', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Light brightness' });
  fireEvent.input(slider, { target: { value: '55' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  fireEvent.input(slider, { target: { value: '89' } });
  await act(async () => {
    fixture.socketDisconnect();
    fixture.socketReconnect();
    ack.resolve({});
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
  });
  expect(fixture.calls).toHaveLength(1);
  expect(screen.getByRole('alert').textContent).toContain('Connection changed');
});

it('drops queued room brightness for a light turned off before the next service dispatch', async () => {
  const fixture = ref.current!;
  const id = 'light.light_living_room_bulbs';
  fixture.publish(id, 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondWith(() => ack.promise);
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Room brightness' });
  fireEvent.input(slider, { target: { value: '55' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  fireEvent.input(slider, { target: { value: '89' } });
  await act(async () => {
    fixture.publish(id, 'off', { supported_color_modes: ['brightness'] });
    ack.resolve({});
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
  });
  expect(fixture.calls).toHaveLength(1);
  expect(slider).toHaveProperty('disabled', true);
});

it('debounces warmth while dragging, coalesces rapid input, and shows service failures', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', {
    supported_color_modes: ['color_temp'],
    color_temp_kelvin: 3000,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6000,
  });
  const ack = deferred();
  fixture.respondInOrder(ack.promise, Promise.resolve({}));
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Light colour temperature' });
  fireEvent.input(slider, { target: { value: '3500' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  fireEvent.input(slider, { target: { value: '4000' } });
  fireEvent.input(slider, { target: { value: '4500' } });
  expect(slider).toHaveProperty('disabled', false);
  await act(async () => ack.reject({ message: 'Light refused adjustment.' }));
  expect(screen.getByRole('alert').textContent).toContain('Light refused adjustment');
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(fixture.calls[1]).toMatchObject({ service_data: { color_temp_kelvin: 4500 } });
});

it('orders explicit power off after a pending adjustment and cancels its queued final input', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondInOrder(ack.promise, Promise.resolve({}));
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Light brightness' });
  fireEvent.input(slider, { target: { value: '55' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  fireEvent.input(slider, { target: { value: '89' } });
  fireEvent.click(screen.getByRole('button', { name: 'Turn off Gym' }));
  expect(fixture.calls).toHaveLength(1);
  await act(async () => ack.resolve({}));
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  expect(fixture.calls[1]).toMatchObject({ service: 'turn_off' });
  await act(async () => fixture.publish('light.gym', 'off', { supported_color_modes: ['brightness'] }));
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
  });
  expect(fixture.calls).toHaveLength(2);
});

it('reconciles brightness telemetry independently when colour changes before brightness is reported', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, rgb_color: [255, 0, 0], supported_color_modes: ['rgb'] });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Light brightness' });
  fireEvent.input(slider, { target: { value: '68' } });
  await screen.findByText('Service accepted; waiting for reported state.');
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Colour wheel' }), { key: 'ArrowRight', shiftKey: true });
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  await act(async () => fixture.publish('light.gym', 'on', { brightness: 173, rgb_color: [255, 42, 0], supported_color_modes: ['rgb'] }));
  await waitFor(() => expect(screen.getByText('Reported brightness 68%')).toBeTruthy());
  await act(async () => fixture.publish('light.gym', 'on', { brightness: 80, rgb_color: [255, 42, 0], supported_color_modes: ['rgb'] }));
  expect(screen.getByText('Reported brightness 31%')).toBeTruthy();
});

it('releases an older room proposal when the same light is adjusted from its details', async () => {
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasAllLights />
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const roomSlider = screen.getByRole('slider', { name: 'Gym brightness' });
  fireEvent.input(roomSlider, { target: { value: '55' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  fireEvent.input(screen.getByRole('slider', { name: 'Light brightness' }), { target: { value: '89' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  await act(async () => fixture.publish('light.gym', 'on', { brightness: 227, supported_color_modes: ['brightness'] }));
  await waitFor(() => expect(roomSlider.getAttribute('aria-valuetext')).toContain('reported 89 percent'));
});

it('reconciles each room independently when switching rooms before acknowledgement', async () => {
  const fixture = ref.current!;
  const living = 'light.light_living_room_bulbs';
  const kitchen = 'light.light_kitchen';
  fixture.publish(living, 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  fixture.publish(kitchen, 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  const livingAck = deferred();
  fixture.respondWith(message =>
    (message as { target: { entity_id: string[] } }).target.entity_id[0] === living ? livingAck.promise : Promise.resolve({})
  );
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  fireEvent.input(screen.getByRole('slider', { name: 'Room brightness' }), { target: { value: '55' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(1));
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  fireEvent.input(screen.getByRole('slider', { name: 'Room brightness' }), { target: { value: '89' } });
  await waitFor(() => expect(fixture.calls).toHaveLength(2));
  await act(async () => {
    livingAck.resolve({});
    fixture.publish(living, 'on', { brightness: 140, supported_color_modes: ['brightness'] });
    fixture.publish(kitchen, 'on', { brightness: 227, supported_color_modes: ['brightness'] });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  await userEvent.click(screen.getByRole('option', { name: 'Living Room' }));
  const slider = screen.getByRole('slider', { name: 'Room brightness' });
  await waitFor(() => expect(slider.getAttribute('aria-valuetext')).toContain('reported 55 percent'));
  expect(slider.getAttribute('aria-busy')).toBe('false');
});

const advanceLightTime = async (ms: number) => {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
};

it.each(['room brightness', 'detail brightness', 'colour', 'warmth'])(
  'debounces sustained %s movement until 250 ms after the final input',
  async kind => {
    vi.useFakeTimers();
    const fixture = ref.current!;
    const id = kind === 'room brightness' ? 'light.light_living_room_bulbs' : 'light.gym';
    fixture.publish(id, 'on', {
      brightness: 100,
      rgb_color: [255, 0, 0],
      color_temp_kelvin: 3000,
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6000,
      supported_color_modes: ['rgb', 'color_temp'],
    });
    render(
      <CanvasLightsProvider>
        {kind === 'room brightness' ? <CanvasLights onOpenAll={() => {}} /> : <CanvasLightDetails entityId={id} />}
      </CanvasLightsProvider>
    );
    const slider = screen.getByRole('slider', {
      name:
        kind === 'room brightness'
          ? 'Room brightness'
          : kind === 'detail brightness'
            ? 'Light brightness'
            : kind === 'colour'
              ? 'Colour wheel'
              : 'Light colour temperature',
    });
    for (let index = 0; index < 8; index++) {
      if (kind === 'colour') fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
      else fireEvent.input(slider, { target: { value: kind === 'warmth' ? String(3500 + index * 100) : String(55 + index) } });
      if (kind === 'colour') expect(slider.getAttribute('aria-disabled')).toBe('false');
      else expect(slider).toHaveProperty('disabled', false);
      if (kind.includes('brightness')) expect(slider).toHaveProperty('value', String(55 + index));
      await advanceLightTime(100);
      expect(fixture.calls).toHaveLength(0);
    }
    // Blur and pointer release do not bypass the quiet period.
    fireEvent.blur(slider);
    fireEvent.pointerUp(slider);
    await advanceLightTime(149);
    expect(fixture.calls).toHaveLength(0);
    await advanceLightTime(1);
    expect(fixture.calls).toHaveLength(1);
    const data = kind === 'colour' ? { rgb_color: [173, 255, 0] } : kind === 'warmth' ? { color_temp_kelvin: 4200 } : { brightness: 158 };
    expect(fixture.calls[0]).toMatchObject({ target: { entity_id: [id] }, service_data: data });
    await advanceLightTime(500);
    expect(fixture.calls).toHaveLength(1);
  }
);

it('keeps independent quiet-period deadlines for brightness and colour', async () => {
  vi.useFakeTimers();
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, rgb_color: [255, 0, 0], supported_color_modes: ['rgb'] });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  fireEvent.input(screen.getByRole('slider', { name: 'Light brightness' }), { target: { value: '68' } });
  await advanceLightTime(100);
  const colour = screen.getByRole('slider', { name: 'Colour wheel' });
  fireEvent.keyDown(colour, { key: 'ArrowRight', shiftKey: true });
  await advanceLightTime(149);
  expect(fixture.calls).toHaveLength(0);
  await advanceLightTime(1);
  expect(fixture.calls).toMatchObject([{ service_data: { brightness: 173 } }]);
  fireEvent.keyDown(colour, { key: 'ArrowRight', shiftKey: true });
  await advanceLightTime(249);
  expect(fixture.calls).toHaveLength(1);
  await advanceLightTime(1);
  expect(fixture.calls[1]).toMatchObject({ service_data: { rgb_color: [255, 84, 0] } });
});

it.each([100, 400])('preserves the final quiet period when acknowledgement takes %s ms', async ackDelay => {
  vi.useFakeTimers();
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  const ack = deferred();
  fixture.respondInOrder(ack.promise, Promise.resolve({}));
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const slider = screen.getByRole('slider', { name: 'Light brightness' });
  fireEvent.input(slider, { target: { value: '55' } });
  await advanceLightTime(250);
  expect(fixture.calls).toHaveLength(1);
  fireEvent.input(slider, { target: { value: '72' } });
  await advanceLightTime(100);
  fireEvent.input(slider, { target: { value: '89' } });
  await advanceLightTime(ackDelay);
  expect(fixture.calls).toHaveLength(1);
  await act(async () => ack.resolve({}));
  if (ackDelay < 250) {
    expect(fixture.calls).toHaveLength(1);
    await advanceLightTime(249 - ackDelay);
    expect(fixture.calls).toHaveLength(1);
    await advanceLightTime(1);
  }
  expect(fixture.calls).toHaveLength(2);
  expect(fixture.calls[1]).toMatchObject({ service_data: { brightness: 227 } });
});

it.each(['reconnect', 'replacement', 'unmount'])('cancels unsent adjustments on %s', async kind => {
  vi.useFakeTimers();
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, rgb_color: [255, 0, 0], supported_color_modes: ['rgb'] });
  const view = render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  fireEvent.input(screen.getByRole('slider', { name: 'Light brightness' }), { target: { value: '68' } });
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Colour wheel' }), { key: 'ArrowRight', shiftKey: true });
  await advanceLightTime(100);
  if (kind === 'unmount') view.unmount();
  else
    await act(async () => {
      if (kind === 'replacement') fixture.reconnect();
      else {
        fixture.socketDisconnect();
        fixture.socketReconnect();
      }
    });
  await advanceLightTime(500);
  expect(fixture.calls).toHaveLength(0);
});

it('sends power immediately and cancels all unsent property adjustments', async () => {
  vi.useFakeTimers();
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, rgb_color: [255, 0, 0], supported_color_modes: ['rgb'] });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  fireEvent.input(screen.getByRole('slider', { name: 'Light brightness' }), { target: { value: '68' } });
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Colour wheel' }), { key: 'ArrowRight', shiftKey: true });
  await advanceLightTime(100);
  fireEvent.click(screen.getByRole('button', { name: 'Turn off Gym' }));
  expect(fixture.calls).toMatchObject([{ service: 'turn_off' }]);
  await act(async () => fixture.publish('light.gym', 'off', { supported_color_modes: ['rgb'] }));
  await advanceLightTime(500);
  expect(fixture.calls).toHaveLength(1);
});

it('supersedes an unsent room proposal with the latest detail brightness', async () => {
  vi.useFakeTimers();
  const fixture = ref.current!;
  fixture.publish('light.gym', 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasAllLights />
      <CanvasLightDetails entityId='light.gym' />
    </CanvasLightsProvider>
  );
  const roomSlider = screen.getByRole('slider', { name: 'Gym brightness' });
  fireEvent.input(roomSlider, { target: { value: '55' } });
  await advanceLightTime(100);
  fireEvent.input(screen.getByRole('slider', { name: 'Light brightness' }), { target: { value: '89' } });
  await advanceLightTime(249);
  expect(fixture.calls).toHaveLength(0);
  await advanceLightTime(1);
  expect(fixture.calls).toMatchObject([{ service_data: { brightness: 227 } }]);
  await act(async () => fixture.publish('light.gym', 'on', { brightness: 227, supported_color_modes: ['brightness'] }));
  expect(roomSlider.getAttribute('aria-valuetext')).toContain('reported 89 percent');
});

it('keeps a room gesture target when switching rooms during its quiet period', async () => {
  vi.useFakeTimers();
  const fixture = ref.current!;
  const living = 'light.light_living_room_bulbs';
  const kitchen = 'light.light_kitchen';
  fixture.publish(living, 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  fixture.publish(kitchen, 'on', { brightness: 100, supported_color_modes: ['brightness'] });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  fireEvent.input(screen.getByRole('slider', { name: 'Room brightness' }), { target: { value: '55' } });
  await advanceLightTime(100);
  fireEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  fireEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  fireEvent.input(screen.getByRole('slider', { name: 'Room brightness' }), { target: { value: '89' } });
  await advanceLightTime(150);
  expect(fixture.calls).toMatchObject([{ target: { entity_id: [living] }, service_data: { brightness: 140 } }]);
  await advanceLightTime(100);
  expect(fixture.calls[1]).toMatchObject({ target: { entity_id: [kitchen] }, service_data: { brightness: 227 } });
});

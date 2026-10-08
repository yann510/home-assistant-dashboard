// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasLightDetails } from './CanvasLightDetails';
import { CanvasLights } from './CanvasLights';
import { CanvasLightsProvider, useCanvasLights } from './useCanvasLights';
import { createHaFixture } from './testing/haFixture';

const ref = vi.hoisted(() => ({ current: null as ReturnType<typeof createHaFixture> | null }));
vi.mock('@hakit/core', () => ({
  useStore: Object.assign((select: (state: unknown) => unknown) => ref.current!.useStore(select), {
    getState: () => ref.current!.getState(),
    subscribe: (listener: () => void) => ref.current!.subscribe(listener),
  }),
}));
const kitchen = 'light.light_kitchen';
const gym = 'light.gym';
const office = 'light.office_bulbs';
const dimmable = { supported_color_modes: ['brightness'] };
beforeEach(() => {
  ref.current = createHaFixture();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(['room', 'detail'])('boosts explicit kitchen Night power-on through the %s control and waits for brightness', async route => {
  const fixture = ref.current!;
  fixture.publish(kitchen, 'off', { ...dimmable, brightness: 25 });
  render(
    <CanvasLightsProvider>
      {route === 'room' ? <CanvasLights onOpenAll={() => {}} /> : <CanvasLightDetails entityId={kitchen} />}
    </CanvasLightsProvider>
  );
  if (route === 'room') {
    fireEvent.click(screen.getByRole('button', { name: 'Lights room' }));
    fireEvent.click(screen.getByRole('option', { name: 'Kitchen' }));
  }
  // Mode changes after rendering must affect the next request.
  act(() => fixture.publish('input_boolean.night_mode', 'on'));
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: route === 'room' ? 'Turn on Kitchen lights' : 'Turn on Kitchen' }))
  );
  expect(fixture.calls).toMatchObject([{ service: 'turn_on', target: { entity_id: [kitchen] }, service_data: { brightness: 51 } }]);
  await act(async () => fixture.publish(kitchen, 'on', { ...dimmable, brightness: 25 }));
  expect(screen.getByRole('button', { name: route === 'room' ? 'Updating Kitchen lights' : 'Turn off Kitchen' })).toHaveProperty(
    'disabled',
    true
  );
  await act(async () => fixture.publish(kitchen, 'on', { ...dimmable, brightness: 50 }));
  expect(screen.getByRole('button', { name: route === 'room' ? 'Turn off Kitchen lights' : 'Turn off Kitchen' })).toHaveProperty(
    'disabled',
    false
  );
  expect(fixture.getState().entities['input_boolean.night_mode'].state).toBe('on');
});

it('reports unconfirmed when kitchen turns on at the old dim level', async () => {
  vi.useFakeTimers();
  const fixture = ref.current!;
  fixture.publish('input_boolean.night_mode', 'on');
  fixture.publish(kitchen, 'off', { ...dimmable, brightness: 25 });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId={kitchen} />
    </CanvasLightsProvider>
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Turn on Kitchen' })));
  await act(async () => fixture.publish(kitchen, 'on', { ...dimmable, brightness: 25 }));
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole('alert').textContent).toContain('requested device state was not reported');
});

it.each([
  ['office daytime', office, 'off', 'off', dimmable, {}],
  ['office off', office, 'on', 'on', dimmable, {}],
  ['on/off-only office', office, 'on', 'off', { supported_color_modes: ['onoff'] }, {}],
  ['daytime', kitchen, 'off', 'off', dimmable, {}],
  ['other light', gym, 'on', 'off', dimmable, {}],
  ['on/off-only kitchen', kitchen, 'on', 'off', { supported_color_modes: ['onoff'] }, {}],
  ['kitchen off', kitchen, 'on', 'on', dimmable, {}],
  ['brighter kitchen', kitchen, 'on', 'off', { ...dimmable, brightness: 180 }, { brightness: 180 }],
  ['unknown brightness', kitchen, 'on', 'off', dimmable, { brightness: 51 }],
] as const)('preserves the intended data for %s', async (_name, id, night, state, attributes, data) => {
  const fixture = ref.current!;
  fixture.publish('input_boolean.night_mode', night);
  fixture.publish(id, state, attributes);
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId={id} />
    </CanvasLightsProvider>
  );
  await act(async () =>
    fireEvent.click(
      screen.getByRole('button', {
        name: `Turn ${state === 'off' ? 'on' : 'off'} ${id === kitchen ? 'Kitchen' : id === office ? 'Office Bulbs' : 'Gym'}`,
      })
    )
  );
  expect(fixture.calls).toMatchObject([{ service: state === 'off' ? 'turn_on' : 'turn_off', service_data: data }]);
  expect((fixture.calls[0] as { service_data: unknown }).service_data).toEqual(data);
});

it('combines grouped power outcomes while applying brightness only to kitchen and blocking duplicate requests', async () => {
  const fixture = ref.current!;
  fixture.publish('input_boolean.night_mode', 'on');
  fixture.publish(kitchen, 'off', { ...dimmable, brightness: 25 });
  fixture.publish(gym, 'off', dimmable);
  let result: unknown;
  function Group() {
    const { power } = useCanvasLights();
    return (
      <button
        onClick={() => {
          void power([kitchen, gym], 'on').then(next => {
            if (next) result = next;
          });
        }}
      >
        Group on
      </button>
    );
  }
  render(
    <CanvasLightsProvider>
      <Group />
    </CanvasLightsProvider>
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Group on' })));
  fireEvent.click(screen.getByRole('button', { name: 'Group on' }));
  expect(fixture.calls).toMatchObject([
    { target: { entity_id: [kitchen] }, service_data: { brightness: 51 } },
    { target: { entity_id: [gym] }, service_data: {} },
  ]);
  expect(fixture.calls).toHaveLength(2);
  await act(async () => {
    fixture.publish(kitchen, 'on', { ...dimmable, brightness: 51 });
    fixture.publish(gym, 'on', dimmable);
  });
  expect(result).toEqual({
    results: [
      { target: kitchen, phase: 'observed' },
      { target: gym, phase: 'observed' },
    ],
  });
});

it.each([25, 180])('powers office bulbs from details at a Night minimum while preserving brightness %s', async brightness => {
  const fixture = ref.current!;
  fixture.publish('input_boolean.night_mode', 'on');
  fixture.publish('input_boolean.morning_mode', 'off');
  fixture.publish(office, 'off', { supported_color_modes: ['color_temp'], brightness });
  render(
    <CanvasLightsProvider>
      <CanvasLightDetails entityId={office} />
    </CanvasLightsProvider>
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Turn on Office Bulbs' })));
  expect(fixture.calls).toMatchObject([{ target: { entity_id: [office] }, service_data: { brightness: Math.max(51, brightness) } }]);
  await act(async () => fixture.publish(office, 'on', { supported_color_modes: ['color_temp'], brightness: 25 }));
  expect(screen.getByRole('button', { name: 'Turn off Office Bulbs' })).toHaveProperty('disabled', true);
  await act(async () => fixture.publish(office, 'on', { supported_color_modes: ['color_temp'], brightness: Math.max(51, brightness) }));
  expect(screen.getByRole('button', { name: 'Turn off Office Bulbs' })).toHaveProperty('disabled', false);
  expect(fixture.getState().entities['input_boolean.night_mode'].state).toBe('on');
  expect(fixture.getState().entities['input_boolean.morning_mode'].state).toBe('off');
});

it('applies the Night floor to grouped office bulbs while leaving neon unchanged', async () => {
  const fixture = ref.current!;
  fixture.publish('input_boolean.night_mode', 'on');
  fixture.publish('input_boolean.morning_mode', 'off');
  fixture.publish('light.office_bulbs', 'off', { supported_color_modes: ['color_temp'], brightness: null });
  fixture.publish('light.neon_light_led_strip', 'off', { supported_color_modes: ['rgb'], brightness: 25 });
  render(
    <CanvasLightsProvider>
      <CanvasLights onOpenAll={() => {}} />
    </CanvasLightsProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Lights room' }));
  fireEvent.click(screen.getByRole('option', { name: 'Office' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Turn on Office lights' })));
  expect(fixture.calls).toMatchObject([
    { target: { entity_id: ['light.office_bulbs'] }, service_data: { brightness: 51 } },
    { target: { entity_id: ['light.neon_light_led_strip'] }, service_data: {} },
  ]);
  expect((fixture.calls[1] as { service_data: unknown }).service_data).toEqual({});
  await act(async () => {
    fixture.publish('light.office_bulbs', 'on', { supported_color_modes: ['color_temp'], brightness: 25 });
    fixture.publish('light.neon_light_led_strip', 'on', { supported_color_modes: ['rgb'], brightness: 25 });
  });
  expect(screen.getByRole('button', { name: 'Updating Office lights' })).toHaveProperty('disabled', true);
  await act(async () => fixture.publish('light.office_bulbs', 'on', { supported_color_modes: ['color_temp'], brightness: 51 }));
  expect(screen.getByRole('button', { name: 'Turn off Office lights' })).toHaveProperty('disabled', false);
  expect(fixture.getState().entities['input_boolean.night_mode'].state).toBe('on');
  expect(fixture.getState().entities['input_boolean.morning_mode'].state).toBe('off');
});

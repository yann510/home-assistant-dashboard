// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard.tsx';

const modes = vi.hoisted(() => ({
  morning: { state: 'off', service: { toggle: vi.fn(), turnOn: vi.fn() } },
  night: { state: 'on', service: { toggle: vi.fn(), turnOn: vi.fn() } },
}));

vi.mock('@hakit/core', () => ({
  useEntity: (entity: string) => (entity === 'input_boolean.morning_mode' ? modes.morning : modes.night),
}));

vi.mock('@hakit/components', () => ({
  ButtonCard: ({ entity, title, description, onClick, ...props }: Record<string, unknown>) => {
    const mode = entity === 'input_boolean.morning_mode' ? modes.morning : modes.night;
    const renderedDescription = props.hideDetails ? null : description || 'Input boolean';
    return (
      <button type='button' aria-pressed={Boolean(props['aria-pressed'])} onClick={() => (onClick as (value: unknown) => void)(mode)}>
        {String(title)}
        {renderedDescription ? ` ${String(renderedDescription)}` : null}
      </button>
    );
  },
  MediaPlayerCard: () => <div>Media</div>,
  VacuumCard: () => <div>Vacuum</div>,
  WeatherCard: () => <div>Weather</div>,
}));

vi.mock('./LightsGroup.tsx', () => ({ LightsGroup: () => <div>Lights</div> }));
vi.mock('./BlindsGroup.tsx', () => ({ BlindsGroup: () => <div>Blinds</div> }));

afterEach(() => {
  cleanup();
  modes.morning.service.toggle.mockReset();
  modes.morning.service.turnOn.mockReset();
  modes.night.service.toggle.mockReset();
  modes.night.service.turnOn.mockReset();
});

describe('Dashboard home modes', () => {
  it('presents Day and Night as one mutually exclusive choice', () => {
    render(<Dashboard />);

    const dayMode = screen.getByRole('button', { name: 'Day' });
    const nightMode = screen.getByRole('button', { name: 'Night' });

    expect(dayMode.getAttribute('aria-pressed')).toBe('false');
    expect(nightMode.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText(/active|inactive/i)).toBeNull();
  });

  it('selects the inactive mode without turning off the active mode', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const dayMode = screen.getByRole('button', { name: 'Day' });
    const nightMode = screen.getByRole('button', { name: 'Night' });

    await user.click(nightMode);
    expect(modes.night.service.turnOn).not.toHaveBeenCalled();
    expect(modes.night.service.toggle).not.toHaveBeenCalled();

    await user.click(dayMode);
    expect(modes.morning.service.turnOn).toHaveBeenCalledOnce();
    expect(modes.morning.service.toggle).not.toHaveBeenCalled();
  });
});

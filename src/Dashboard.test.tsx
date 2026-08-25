// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard.tsx';

const modes = vi.hoisted(() => ({
  morning: { state: 'off', service: { toggle: vi.fn() } },
  night: { state: 'on', service: { toggle: vi.fn() } },
}));

vi.mock('@hakit/core', () => ({
  useEntity: (entity: string) => (entity === 'input_boolean.morning_mode' ? modes.morning : modes.night),
}));

vi.mock('@hakit/components', () => ({
  ButtonCard: ({ entity, title, description, onClick, ...props }: Record<string, unknown>) => {
    const mode = entity === 'input_boolean.morning_mode' ? modes.morning : modes.night;
    return (
      <button type='button' aria-pressed={Boolean(props['aria-pressed'])} onClick={() => (onClick as (value: unknown) => void)(mode)}>
        {String(title)} {String(description)}
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
  modes.night.service.toggle.mockReset();
});

describe('Dashboard home modes', () => {
  it('shows Morning Mode and lets the user toggle it', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const morningMode = screen.getByRole('button', { name: /morning mode inactive/i });
    expect(morningMode.getAttribute('aria-pressed')).toBe('false');
    await user.click(morningMode);

    expect(modes.morning.service.toggle).toHaveBeenCalledOnce();
  });

  it('shows the current night mode and lets the user toggle it', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const nightMode = screen.getByRole('button', { name: /night mode active/i });
    expect(nightMode.getAttribute('aria-pressed')).toBe('true');
    await user.click(nightMode);

    expect(modes.night.service.toggle).toHaveBeenCalledOnce();
  });
});

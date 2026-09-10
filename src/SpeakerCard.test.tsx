vi.mock('./TemperatureCard', () => ({ TemperatureCard: () => null }));
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard.tsx';

const ha = vi.hoisted(() => ({
  entities: {} as Record<
    string,
    { entity_id: string; state: string; attributes: { friendly_name: string; group_members?: string[]; media_content_type?: string } }
  >,
  connection: { connected: true, sendMessagePromise: vi.fn() },
  connectionStatus: 'connected',
}));

vi.mock('@hakit/core', () => ({
  useEntity: (entity: string) => ha.entities[entity] ?? null,
  useStore: (selector: (state: typeof ha) => unknown) => selector(ha),
}));
vi.mock('@hakit/components', () => ({
  MediaPlayerCard: ({ entity, groupMembers }: { entity: string; groupMembers?: string[] }) => (
    <div aria-label='Playback controls' data-entity={entity} data-members={JSON.stringify(groupMembers)} />
  ),
  WeatherCard: () => null,
  VacuumCard: () => null,
}));
vi.mock('./SpeakerPlayer', () => ({
  SpeakerPlayer: ({ entityId, members }: { entityId: string; members: string[] }) => (
    <div aria-label='Playback controls' data-entity={entityId} data-members={JSON.stringify(members)} />
  ),
}));
vi.mock('./AppliancesCard.tsx', () => ({ AppliancesCard: () => null }));
vi.mock('./HomeModeControls.tsx', () => ({ HomeModeControls: () => null }));
vi.mock('./LightsGroup.tsx', () => ({ LightsGroup: () => null }));
vi.mock('./BlindsGroup.tsx', () => ({ BlindsGroup: () => null }));

beforeEach(() => {
  ha.entities = Object.fromEntries(
    ['living_room', 'bathroom', 'bedroom', 'gym'].map(room => {
      const entity_id = `media_player.${room}`;
      return [
        entity_id,
        { entity_id, state: room === 'bathroom' ? 'playing' : 'paused', attributes: { friendly_name: room, group_members: [entity_id] } },
      ];
    })
  );
  for (const [entity_id, state] of [
    ['input_boolean.speaker_follow_motion', 'off'],
    ['input_text.speaker_follow_source', ''],
    ['script.speaker_follow_motion', 'off'],
  ])
    ha.entities[entity_id] = { entity_id, state, attributes: { friendly_name: entity_id } };
  ha.connection.connected = true;
  ha.connectionStatus = 'connected';
  ha.connection.sendMessagePromise.mockReset().mockResolvedValue({ context: {}, response: { success: true } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Motion speaker following', () => {
  it('only arms motion following, including for non-playlist audio', async () => {
    ha.entities['media_player.bathroom'].attributes.media_content_type = 'tvshow';
    render(<Dashboard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    expect(ha.connection.sendMessagePromise).toHaveBeenCalledExactlyOnceWith({
      type: 'call_service',
      domain: 'script',
      service: 'speaker_follow_motion',
      return_response: true,
      service_data: { command: 'enable', source_entity: 'media_player.bathroom' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays armed after a reload before any room has joined', () => {
    ha.entities['input_boolean.speaker_follow_motion'].state = 'on';
    ha.entities['input_text.speaker_follow_source'].state = 'media_player.bathroom';
    render(<Dashboard />);
    expect(screen.getByRole('switch', { name: 'Follow me' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Rooms join when motion is detected/)).not.toBeNull();
    expect(ha.connection.sendMessagePromise).not.toHaveBeenCalled();
  });

  it('turns following off using the saved source even when another speaker is playing', async () => {
    ha.entities['input_boolean.speaker_follow_motion'].state = 'on';
    ha.entities['input_text.speaker_follow_source'].state = 'media_player.gym';
    render(<Dashboard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    expect(ha.connection.sendMessagePromise).toHaveBeenCalledExactlyOnceWith({
      type: 'call_service',
      domain: 'script',
      service: 'speaker_follow_motion',
      return_response: true,
      service_data: { command: 'disable' },
    });
  });

  it('does not mistake a manual speaker group for enabled motion following', () => {
    const group = ['media_player.bathroom', 'media_player.living_room', 'media_player.bedroom', 'media_player.gym'];
    for (const id of group) ha.entities[id].attributes.group_members = group;
    render(<Dashboard />);
    expect(screen.getByRole('switch', { name: 'Follow me' }).getAttribute('aria-checked')).toBe('false');
  });

  it('keeps playback controls restricted to the actual group', () => {
    render(<Dashboard />);
    expect(screen.getByLabelText('Playback controls').getAttribute('data-members')).toBe('["media_player.bathroom"]');
  });

  it('allows following to be turned off when the original speaker is unavailable', async () => {
    ha.entities['input_boolean.speaker_follow_motion'].state = 'on';
    ha.entities['input_text.speaker_follow_source'].state = 'media_player.gym';
    ha.entities['media_player.gym'].state = 'unavailable';
    render(<Dashboard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    expect(ha.connection.sendMessagePromise).toHaveBeenCalledWith(expect.objectContaining({ service_data: { command: 'disable' } }));
  });

  it('disables the toggle if Home Assistant has not been configured', () => {
    delete ha.entities['script.speaker_follow_motion'];
    render(<Dashboard />);
    expect(screen.getByRole('switch', { name: 'Follow me' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Follow me is not available in Home Assistant.')).not.toBeNull();
  });

  it('shows the actual service error without claiming following was enabled', async () => {
    ha.connection.sendMessagePromise.mockRejectedValue({
      code: 'service_validation_error',
      message: 'The original speaker is unavailable.',
    });
    render(<Dashboard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The original speaker is unavailable.');
    expect(screen.getByRole('switch', { name: 'Follow me' }).getAttribute('aria-checked')).toBe('false');
  });

  it('blocks duplicate commands and recovers when Home Assistant never answers', async () => {
    vi.useFakeTimers();
    ha.connection.sendMessagePromise.mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    const toggle = screen.getByRole('switch', { name: 'Follow me' });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(ha.connection.sendMessagePromise).toHaveBeenCalledOnce();
    expect(toggle.hasAttribute('disabled')).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(screen.getByRole('alert').textContent).toContain('Home Assistant did not respond.');
    expect(toggle.hasAttribute('disabled')).toBe(false);
  });

  it('shows a script validation failure even when Home Assistant accepts the service call', async () => {
    ha.connection.sendMessagePromise.mockResolvedValue({
      response: { success: false, error: 'Finish turning off Follow me before choosing another source.' },
    });
    render(<Dashboard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Finish turning off Follow me before choosing another source.');
  });

  it('does not mistake an aborted script for a completed command', async () => {
    ha.connection.sendMessagePromise.mockResolvedValue({ response: {} });
    render(<Dashboard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Home Assistant did not finish the command.');
  });

  it('disables the toggle while disconnected and requires a source to enable it', () => {
    ha.connection.connected = false;
    const { rerender } = render(<Dashboard />);
    expect(screen.getByRole('switch', { name: 'Follow me' }).hasAttribute('disabled')).toBe(true);
    ha.connection.connected = true;
    for (const id of ['living_room', 'bathroom', 'bedroom', 'gym']) ha.entities[`media_player.${id}`].state = 'idle';
    rerender(<Dashboard />);
    expect(screen.getByRole('switch', { name: 'Follow me' }).hasAttribute('disabled')).toBe(true);
  });

  it('preserves a pending cleanup across reloads and retries turning off instead of selecting a new source', async () => {
    ha.entities['input_text.speaker_follow_source'].state = 'media_player.gym';
    ha.entities['script.speaker_follow_motion'].state = 'on';
    const { rerender } = render(<Dashboard />);
    expect(screen.getByRole('switch', { name: 'Follow me' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Retry ungrouping' })).toBeNull();
    expect(screen.queryByText(/Retry returning audio/)).toBeNull();
    expect(screen.getByRole('switch', { name: 'Follow me' }).getAttribute('aria-busy')).toBe('true');
    ha.entities['script.speaker_follow_motion'].state = 'off';
    rerender(<Dashboard />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry ungrouping' }));
    expect(ha.connection.sendMessagePromise).toHaveBeenCalledExactlyOnceWith({
      type: 'call_service',
      domain: 'script',
      service: 'speaker_follow_motion',
      return_response: true,
      service_data: { command: 'disable' },
    });
  });

  it('never shows retry during a successful ungroup, including intermediate helper updates', async () => {
    let finish!: (result: unknown) => void;
    ha.connection.sendMessagePromise.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    ha.entities['input_boolean.speaker_follow_motion'].state = 'on';
    ha.entities['input_text.speaker_follow_source'].state = 'media_player.bathroom';
    const { rerender } = render(<Dashboard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));

    ha.entities['input_boolean.speaker_follow_motion'].state = 'off';
    ha.entities['script.speaker_follow_motion'].state = 'on';
    rerender(<Dashboard />);
    expect(screen.queryByRole('button', { name: 'Retry ungrouping' })).toBeNull();
    expect(screen.queryByText(/Retry returning audio/)).toBeNull();

    // The script can finish before this client receives the service response.
    ha.entities['script.speaker_follow_motion'].state = 'off';
    rerender(<Dashboard />);
    expect(screen.queryByRole('button', { name: 'Retry ungrouping' })).toBeNull();

    ha.entities['input_text.speaker_follow_source'].state = '';
    await act(async () => {
      finish({ response: { success: true } });
    });
    rerender(<Dashboard />);
    expect(screen.queryByRole('button', { name: 'Retry ungrouping' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Follow me' }).getAttribute('aria-busy')).toBe('false');
  });

  it('offers retry when ungrouping has finished with an error and a saved source remains', async () => {
    let fail!: (reason: unknown) => void;
    ha.connection.sendMessagePromise.mockReturnValue(
      new Promise((_, reject) => {
        fail = reject;
      })
    );
    ha.entities['input_boolean.speaker_follow_motion'].state = 'on';
    ha.entities['input_text.speaker_follow_source'].state = 'media_player.bathroom';
    const { rerender } = render(<Dashboard />);
    await userEvent.click(screen.getByRole('switch', { name: 'Follow me' }));
    ha.entities['input_boolean.speaker_follow_motion'].state = 'off';
    await act(async () => {
      fail(new Error('Speaker did not respond.'));
    });
    rerender(<Dashboard />);
    expect(screen.getByRole('button', { name: 'Retry ungrouping' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('Speaker did not respond.');
  });
});

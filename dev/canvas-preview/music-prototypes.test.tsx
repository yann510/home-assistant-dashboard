// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { MusicPrototypes } from './music-prototypes';

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/');
});

it('lets a user compare all five directions without navigating or changing playback', async () => {
  history.replaceState(null, '', '/?musicPrototypes=1&artwork=1');
  const originalUrl = location.href;
  render(<MusicPrototypes />);
  const user = userEvent.setup();
  const radios = screen.getAllByRole('radio') as HTMLInputElement[];
  expect(radios).toHaveLength(5);
  expect(radios[0].checked).toBe(true);
  await user.tab();
  expect(document.activeElement).toBe(radios[0]);
  await user.click(radios[1]);
  expect(radios[1].checked).toBe(true);
  radios[4].focus();
  await user.keyboard(' ');
  expect(radios[4].checked).toBe(true);
  expect(radios.filter(radio => radio.checked)).toHaveLength(1);
  expect(location.href).toBe(originalUrl);
});

it('supports links to a particular direction and safely defaults for unknown names', () => {
  history.replaceState(null, '', '/?musicPrototype=on-air');
  const view = render(<MusicPrototypes />);
  expect((screen.getByRole('radio', { name: /On air/ }) as HTMLInputElement).checked).toBe(true);
  view.unmount();
  history.replaceState(null, '', '/?musicPrototype=unknown');
  render(<MusicPrototypes />);
  expect((screen.getByRole('radio', { name: /Orbit/ }) as HTMLInputElement).checked).toBe(true);
});

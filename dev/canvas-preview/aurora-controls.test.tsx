// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { AuroraControls } from './aurora-controls';

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/');
});

it('compares two progress directions in place with keyboard and pointer selection', async () => {
  history.replaceState(null, '', '/?auroraControls=1&artwork=1');
  const originalUrl = location.href;
  render(<AuroraControls />);
  const user = userEvent.setup();
  const radios = screen.getAllByRole('radio') as HTMLInputElement[];
  expect(radios).toHaveLength(2);
  expect(radios[0].checked).toBe(true);
  await user.tab();
  expect(document.activeElement).toBe(radios[0]);
  await user.click(radios[1]);
  expect(radios[1].checked).toBe(true);
  radios[0].focus();
  await user.keyboard(' ');
  expect(radios[0].checked).toBe(true);
  expect(radios.filter(radio => radio.checked)).toHaveLength(1);
  expect(location.href).toBe(originalUrl);
});

it('deep-links progress choices and defaults safely for unknown names', () => {
  history.replaceState(null, '', '/?progressPrototype=halo');
  const view = render(<AuroraControls />);
  expect((screen.getByRole('radio', { name: /Halo/ }) as HTMLInputElement).checked).toBe(true);
  view.unmount();
  for (const requested of ['unknown', 'flow']) {
    history.replaceState(null, '', `/?progressPrototype=${requested}`);
    const fallback = render(<AuroraControls />);
    expect((screen.getByRole('radio', { name: /Comet/ }) as HTMLInputElement).checked).toBe(true);
    fallback.unmount();
  }
});

it('gates the button aurora by the preview picker and actual active playback', () => {
  const css = readFileSync('dev/canvas-preview/aurora-controls.css', 'utf8');
  const selector = css.match(/:is\((body:has\(#aurora-controls-title\)[^,]+), #preview-tools \.aurora-controls__button\)::before/)?.[1];
  expect(selector).toBeTruthy();
  const fixture = document.createElement('div');
  fixture.innerHTML = '<div id="aurora-controls-title"></div><div id="root"><div class="canvas"><section class="canvas-music" data-playing="true"><div class="canvas-music__transport"><button></button><button></button><button></button></div></section></div></div>';
  document.body.append(fixture);
  const buttons = fixture.querySelectorAll('button');
  expect(buttons[1].matches(selector!)).toBe(true);
  expect(buttons[0].matches(selector!)).toBe(false);
  buttons[1].setAttribute('disabled', '');
  expect(buttons[1].matches(selector!)).toBe(false);
  buttons[1].removeAttribute('disabled');
  fixture.querySelector('.canvas-music')!.setAttribute('data-playing', 'false');
  expect(buttons[1].matches(selector!)).toBe(false);
  fixture.querySelector('.canvas-music')!.setAttribute('data-playing', 'true');
  fixture.querySelector('#aurora-controls-title')!.remove();
  expect(buttons[1].matches(selector!)).toBe(false);
  fixture.remove();
});

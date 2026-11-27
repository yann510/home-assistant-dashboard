import { expect, test, type Locator, type Page } from '@playwright/test';

async function openPreview(page: Page, query = '') {
  await page.goto(`/dev/canvas-preview/index.html?view=canvas&${query}`);
  // The preview tools are absent in the production dashboard.
  await page.addStyleTag({ content: '#preview-tools { display: none !important }' });
  await expect(page.getByRole('region', { name: 'Music', exact: true })).toBeVisible();
}

async function geometry(control: Locator) {
  return control.evaluate(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    const dialogScroll = element.closest('.canvas-dialog__body')?.scrollTop ?? 0;
    return [x, y + window.scrollY + dialogScroll, width, height].map(value => Math.round(value));
  });
}

async function expectStable(controls: Record<string, Locator>, before: Record<string, number[]>) {
  for (const [name, control] of Object.entries(controls)) {
    const after = await geometry(control);
    for (const [index, axis] of ['x', 'y', 'width', 'height'].entries()) {
      expect.soft(Math.abs(after[index] - before[name][index]), `${name} ${axis}`).toBeLessThanOrEqual(1);
    }
  }
}

async function capture(controls: Record<string, Locator>) {
  return Object.fromEntries(await Promise.all(Object.entries(controls).map(async ([name, control]) => [name, await geometry(control)])));
}

function overviewControls(page: Page) {
  const music = page.getByRole('region', { name: 'Music', exact: true });
  return {
    music,
    pulse: page.getByRole('region', { name: 'House pulse', exact: true }),
    follow: music.getByRole('switch', { name: 'Follow me' }),
    playlists: music.getByRole('button', { name: 'Playlists', exact: true }),
    speakers: music.getByRole('button', { name: 'Open speakers' }),
    volume: music.getByRole('button', { name: /Open speaker volume/ }),
    mood: page.getByRole('group', { name: 'Choose a house mood' }),
    homeControls: page.getByRole('region', { name: 'Home controls' }),
  };
}

test('music command failures appear in House Pulse without moving any controls', async ({ page, viewport }) => {
  await openPreview(page, 'scene=failure');
  const measured = await page.evaluate(() => [
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
    window.visualViewport?.scale,
  ]);
  expect(measured).toEqual([viewport!.width, viewport!.height, test.info().project.use.deviceScaleFactor, 1]);
  const controls = overviewControls(page);
  if (viewport?.width === 1224) {
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
  }
  const pause = controls.music.getByRole('button', { name: 'Pause', exact: true });
  const seek = controls.music.getByRole('slider', { name: 'Track position' });
  const shuffle = controls.music.getByRole('button', { name: 'Shuffle playlists' });
  const allControls = { ...controls, pause, seek, shuffle };
  const before = await capture(allControls);
  await pause.click();
  const pauseNotice = controls.pulse.getByRole('button', { name: /Could not pause playback/i });
  await expect(pauseNotice).toBeVisible();
  await expect(controls.music.getByRole('alert')).toHaveCount(0);
  await expectStable(allControls, before);

  await pauseNotice.tap();
  const details = page.getByRole('dialog', { name: 'Music alert' });
  await expect(details).toContainText('Controlled preview failure');
  await page.keyboard.press('Escape');
  await expect(details).not.toBeVisible();
  await expect(pauseNotice).toBeFocused();

  await controls.follow.click();
  await expect(controls.pulse.getByRole('button', { name: /Could not enable Follow me/i })).toBeVisible();
  await expectStable(allControls, before);

  await seek.press('ArrowRight');
  const seekNotice = controls.pulse.getByRole('button', { name: /Could not change track position/i });
  await expect(seekNotice).toBeVisible();
  if (viewport?.width === 1224) await expect(seekNotice).toBeInViewport({ ratio: 0.9 });
  await expectStable(allControls, before);

  await controls.music.getByRole('button', { name: 'Lower volume' }).tap();
  const volumeNotice = controls.pulse.getByRole('button', { name: /Could not change volume/i });
  await expect(volumeNotice).toBeVisible();
  await expect(controls.pulse.locator('[data-overview-notice]').first()).toHaveAccessibleName(/Could not change volume/i);
  await expectStable(allControls, before);
});

test('House Pulse keeps the overview in place as notices and activity appear', async ({ page }) => {
  await openPreview(page, 'scene=everyday');
  const { music, pulse, homeControls } = overviewControls(page);
  const controls = { music, pulse, homeControls };
  const before = await capture(controls);
  for (const scene of ['busy', 'health']) {
    await openPreview(page, `scene=${scene}`);
    await expectStable(controls, before);
  }
});

test('music card geometry remains stable with missing or long track metadata', async ({ page }) => {
  await openPreview(page);
  const controls = overviewControls(page);
  await expect(controls.music.getByRole('link', { name: 'All In A Dream' })).toHaveAccessibleDescription(
    'LP Giobbi · DJ Tennis · Joseph Ashworth'
  );
  const before = await capture(controls);
  for (const query of ['long', 'media=idle', 'media=unavailable', 'media=untitled']) {
    await openPreview(page, query);
    await expectStable(controls, before);
  }
});

test('music has room below the title and shuffle sits beside volume with distinct states', async ({ page, viewport }) => {
  await openPreview(page);
  const { music, volume } = overviewControls(page);
  const shuffle = music.getByRole('button', { name: 'Shuffle playlists' });
  if (viewport?.width === 1224) {
    const [, cardTop] = await geometry(music);
    const [, headerTop, , headerHeight] = await geometry(music.locator('.canvas-music__track'));
    const [, playbackTop, , playbackHeight] = await geometry(music.locator('.canvas-music__bottom'));
    const [, seekTop] = await geometry(music.getByRole('slider', { name: 'Track position' }));
    expect(headerTop - cardTop).toBe(12);
    expect(playbackTop - headerTop - headerHeight).toBeGreaterThanOrEqual(30);
    expect(seekTop).toBeGreaterThanOrEqual(playbackTop + playbackHeight);
  }
  await expect(shuffle).toHaveAttribute('aria-pressed', 'true');
  const [shuffleLeft, shuffleTop, width, height] = await geometry(shuffle);
  const [volumeLeft, volumeTop] = await geometry(volume);
  expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
  expect(Math.abs(volumeTop - shuffleTop)).toBeLessThanOrEqual(1);
  expect(shuffleLeft + width).toBeLessThanOrEqual(volumeLeft);
  const dot = () => shuffle.evaluate(element => getComputedStyle(element, '::after').content);
  expect(await dot()).toBe('""');
  await shuffle.tap();
  await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
  expect(await dot()).toBe('none');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(shuffle).toBeFocused();
  expect(await shuffle.evaluate(element => element.matches(':focus-visible'))).toBe(true);
  await page.keyboard.press('Space');
  await expect(shuffle).toHaveAttribute('aria-pressed', 'true');

  await openPreview(page, 'media=idle');
  await expect(shuffle).toBeEnabled();
  await openPreview(page, 'scene=offline');
  await expect(shuffle).toBeDisabled();
});

test('playlist launch feedback keeps the filter, selected tile and dialog controls in place', async ({ page }) => {
  await openPreview(page, 'spotifyDelay=1200&spotifyPlay=failed');
  await overviewControls(page).playlists.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Play Private collection by Yann' })).toBeVisible();
  const tile = dialog.getByRole('button', { name: 'Play Liked Songs' });
  const controls = {
    close: dialog.getByRole('button', { name: 'Close details' }),
    filter: dialog.getByRole('searchbox', { name: 'Filter loaded playlists' }),
    refresh: dialog.getByRole('button', { name: 'Refresh' }),
    tile,
  };
  const before = await capture(controls);
  await tile.tap({ position: { x: 40, y: 30 } });
  await expect(dialog.getByRole('status').filter({ hasText: 'Starting Liked Songs' })).toBeVisible();
  await expectStable(controls, before);

  await expect(dialog.getByRole('alert').filter({ hasText: 'Spotify preview could not start' })).toBeVisible();
  await expect(tile).toBeEnabled();
  await expectStable(controls, before);

  const { close, filter, refresh } = controls;
  await filter.fill('no playlist with this name');
  await expect(dialog.getByText('No loaded playlists match this filter.')).toBeVisible();
  await expectStable({ close, filter, refresh }, before);
});

test('a playlist launch that fails after closing the picker appears in House Pulse', async ({ page }) => {
  await openPreview(page, 'spotifyDelay=1800&spotifyPlay=failed');
  const { playlists, pulse } = overviewControls(page);
  await playlists.tap();
  const picker = page.getByRole('dialog');
  await picker.getByRole('button', { name: 'Play Liked Songs' }).tap();
  await expect(picker.getByRole('status').filter({ hasText: 'Starting Liked Songs' })).toBeVisible();
  await picker.getByRole('button', { name: 'Close details' }).tap();
  await expect(picker).not.toBeVisible();
  const failure = pulse.getByRole('button', { name: /Spotify playlist needs attention/i });
  await expect(failure).toHaveCount(0);
  await expect(failure).toBeVisible();
  await failure.tap();
  await expect(page.getByRole('dialog', { name: 'Music alert' })).toContainText('Spotify preview could not start');
});

test('mood status uncertainty and recheck keep the overview controls in place', async ({ page }) => {
  await openPreview(page, 'scene=mood-idle&unconfirmed');
  const controls = overviewControls(page);
  const before = await capture(controls);
  const mood = page.getByRole('region', { name: 'House Mood' });
  await mood.getByRole('button', { name: 'Love mood' }).tap();
  const notice = controls.pulse.getByRole('button', { name: 'View: Mood change unconfirmed' });
  await expect(notice).toBeVisible();
  await expect(mood.getByRole('alert')).toHaveCount(0);
  await expect(mood.getByRole('button', { name: 'Check status', exact: true })).toHaveCount(0);
  await expectStable(controls, before);

  await notice.tap();
  const dialog = page.getByRole('dialog', { name: 'House Mood alert' });
  await expect(dialog).toContainText('Waiting for Home Assistant to confirm');
  await dialog.getByRole('button', { name: 'Check status', exact: true }).tap();
  await dialog.getByRole('button', { name: 'Close details' }).tap();
  await expect(notice).toHaveCount(0);
  await expectStable(controls, before);
});

test('a mode failure is in House Pulse and retry stays in the dialog', async ({ page }) => {
  await openPreview(page, 'scene=failure');
  const controls = overviewControls(page);
  const night = page.getByRole('button', { name: 'Night mode', exact: true });
  const before = await capture({ ...controls, night });
  await night.tap();
  const notice = controls.pulse.getByRole('button', { name: 'View: Could not set Night mode' });
  await expect(notice).toBeVisible();
  await expect(controls.pulse.getByRole('button', { name: /Retry Night mode/ })).toHaveCount(0);
  await expectStable({ ...controls, night }, before);

  await notice.tap();
  const dialog = page.getByRole('dialog', { name: 'Night mode alert' });
  await expect(dialog).toContainText('Controlled preview failure');
  const retry = dialog.getByRole('button', { name: 'Retry Night mode' });
  await expect(retry).toBeEnabled();
  await retry.tap();
  await expect(dialog).toContainText('Controlled preview failure');
  await dialog.getByRole('button', { name: 'Dismiss Night mode message' }).tap();
  await dialog.getByRole('button', { name: 'Close details' }).tap();
  await expect(notice).toHaveCount(0);
  await expectStable({ ...controls, night }, before);
});

test('reported weather loss stays in House Pulse without moving the header or cards', async ({ page }) => {
  await openPreview(page);
  const overview = overviewControls(page);
  const controls = {
    ...overview,
    modes: page.getByRole('group', { name: 'Home modes' }),
    weather: page.getByRole('button', { name: /^Weather/ }),
    devices: page.getByRole('button', { name: 'All devices' }),
  };
  const before = await capture(controls);
  await openPreview(page, 'weather-unavailable');
  const notice = overview.pulse.getByRole('button', { name: 'View: Weather unavailable' });
  await expect(notice).toBeVisible();
  await expectStable(controls, before);

  await notice.tap();
  const dialog = page.getByRole('dialog', { name: 'Weather' });
  await expect(dialog).toContainText('The forecast will return when the provider reconnects.');
  await dialog.getByRole('button', { name: 'Close details' }).tap();
  await expect(notice).toBeFocused();
  await expectStable(controls, before);
});

test('playlist retry remains tappable while a launch and library error coexist', async ({ page }) => {
  await openPreview(page, 'playlists=unavailable&spotifyPlay=failed');
  await overviewControls(page).playlists.tap();
  const dialog = page.getByRole('dialog');
  const retry = dialog.getByRole('button', { name: 'Retry playlists' });
  const tile = dialog.getByRole('button', { name: 'Play Liked Songs' });
  await expect(retry).toBeVisible();
  await tile.tap({ position: { x: 40, y: 30 } });
  await expect(dialog.getByRole('alert').filter({ hasText: 'Spotify preview could not start' })).toBeInViewport();
  await expect(retry).toBeInViewport({ ratio: 0.95 });
  expect((await geometry(retry))[3]).toBeGreaterThanOrEqual(44);
});

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
    follow: music.getByRole('switch', { name: 'Follow me' }),
    playlists: music.getByRole('button', { name: 'Playlists', exact: true }),
    speakers: music.getByRole('button', { name: 'Open speakers' }),
    volume: music.getByRole('button', { name: /Open speaker volume/ }),
    mood: page.getByRole('group', { name: 'Choose a house mood' }),
    homeControls: page.getByRole('region', { name: 'Home controls' }),
  };
}

test('music command failures keep neighboring controls in place', async ({ page, viewport }) => {
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
  const allControls = { ...controls, pause, seek };
  const before = await capture(allControls);
  await pause.click();
  await expect(controls.music.getByRole('alert').filter({ hasText: 'Could not pause playback' })).toBeVisible();
  await expectStable(allControls, before);

  await controls.follow.click();
  await expect(controls.music.getByRole('alert').filter({ hasText: 'Could not enable Follow me' })).toBeInViewport({ ratio: 0.9 });
  await expectStable(allControls, before);

  await seek.press('ArrowRight');
  await expect(controls.music.getByRole('alert').filter({ hasText: 'Could not change track position' })).toBeInViewport({ ratio: 0.9 });
  await expectStable(allControls, before);
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

test('mood status uncertainty and recheck keep the overview controls in place', async ({ page }) => {
  await openPreview(page, 'scene=mood-idle&unconfirmed');
  const controls = overviewControls(page);
  const before = await capture(controls);
  const mood = page.getByRole('region', { name: 'House Mood' });
  await mood.getByRole('button', { name: 'Love mood' }).tap();
  await expect(mood.getByRole('alert')).toContainText('Waiting for Home Assistant to confirm');
  await expectStable(controls, before);

  await mood.getByRole('button', { name: 'Check status', exact: true }).tap();
  await expect(mood.getByRole('alert')).toHaveCount(0);
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

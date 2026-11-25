import { expect, test, type Page } from '@playwright/test';

async function openPreview(page: Page, query: string) {
  await page.goto(`/dev/canvas-preview/index.html?${query}`);
  await page.addStyleTag({ content: '#preview-tools { display: none !important }' });
}

test('checks, removes, and saves the paused native Sonos track', async ({ page }) => {
  await openPreview(page, 'sonosQueue&media=paused&song=saved');
  const music = page.getByRole('region', { name: 'Music', exact: true });
  const remove = music.getByRole('button', { name: 'Remove All In A Dream from Liked Songs' });
  const save = music.getByRole('button', { name: 'Save All In A Dream to Liked Songs' });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await remove.tap();
  await expect(save).toHaveAttribute('aria-pressed', 'false');
  await save.tap();
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await expect(music.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
});

test('recovers the native Sonos heart after a failed save', async ({ page }) => {
  await openPreview(page, 'sonosQueue&song=error');
  const music = page.getByRole('region', { name: 'Music', exact: true });
  const save = music.getByRole('button', { name: 'Save All In A Dream to Liked Songs' });
  await save.tap();
  const retry = music.getByRole('button', { name: 'Retry song saved state' });
  await expect(music.getByRole('alert').filter({ hasText: 'Tap heart to retry' })).toBeVisible();
  await retry.tap();
  await expect(save).toHaveAttribute('aria-pressed', 'false');
});

test('reopens mood controls after a read-only status check', async ({ page }) => {
  await openPreview(page, 'scene=mood-idle&unconfirmed');
  const mood = page.getByRole('region', { name: 'House Mood' });
  const love = mood.getByRole('button', { name: 'Love mood' });
  await love.tap();
  await expect(mood.getByRole('alert')).toContainText('Waiting for Home Assistant to confirm');
  await expect(love).toBeDisabled();
  await mood.getByRole('button', { name: 'Check status', exact: true }).tap();
  await expect(mood.getByRole('heading', { name: 'Just be.' })).toBeVisible();
  await expect(mood.getByRole('alert')).toHaveCount(0);
  await expect(love).toBeEnabled();
});

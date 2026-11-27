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
  const pulse = page.getByRole('region', { name: 'House pulse', exact: true });
  const notice = pulse.getByRole('button', { name: /saved state|liked songs|save song/i });
  await expect(notice).toBeVisible();
  await expect(music.getByRole('alert')).toHaveCount(0);
  await retry.tap();
  await expect(save).toHaveAttribute('aria-pressed', 'false');
  await expect(notice).toHaveCount(0);
});

test('opens mood restoration from House Pulse and restores controls after retry', async ({ page }) => {
  await openPreview(page, 'scene=mood-recovery');
  const pulse = page.getByRole('region', { name: 'House pulse' });
  const mood = page.getByRole('region', { name: 'House Mood' });
  const love = mood.getByRole('button', { name: 'Love mood' });
  const notice = pulse.getByRole('button', { name: 'View: Mood restoration needs attention' });
  await expect(love).toBeDisabled();
  await expect(mood.getByRole('alert')).toHaveCount(0);
  await notice.tap();
  const dialog = page.getByRole('dialog', { name: 'House Mood alert' });
  await expect(dialog).toContainText('One light could not be restored.');
  await dialog.getByRole('button', { name: 'Retry restoration' }).tap();
  await dialog.getByRole('button', { name: 'Close details' }).tap();
  await expect(mood.getByRole('heading', { name: 'Just be.' })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expect(love).toBeEnabled();
});

test('a partially applied mode has one notice and resumes the saved recovery', async ({ page }) => {
  await openPreview(page, 'scene=mood-idle&mode-recovery');
  const pulse = page.getByRole('region', { name: 'House pulse' });
  const night = page.getByRole('button', { name: 'Night mode', exact: true });
  await night.tap();
  const notice = pulse.locator('[data-overview-notice]');
  await expect(notice).toHaveCount(1);
  await notice.tap();
  const dialog = page.getByRole('dialog', { name: 'House Mood alert' });
  await expect(dialog).toContainText('A mode step could not finish.');
  await expect(dialog.getByRole('button', { name: /Retry Night mode/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Retry restoration' }).tap();
  await dialog.getByRole('button', { name: 'Close details' }).tap();
  await expect(notice).toHaveCount(0);
  await expect(night).toBeEnabled();
});

test('the open mode alert gains restoration when the matching report arrives', async ({ page }) => {
  await openPreview(page, 'scene=mood-idle&mode-recovery=late');
  const pulse = page.getByRole('region', { name: 'House pulse' });
  await page.getByRole('button', { name: 'Night mode', exact: true }).tap();
  await pulse.getByRole('button', { name: 'View: Night mode restoration pending' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Night mode alert' });
  await expect(dialog.getByRole('button', { name: 'Check Night mode status' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('preview-mode-recovery')));
  const retry = dialog.getByRole('button', { name: 'Retry restoration' });
  await expect(retry).toBeEnabled();
  await retry.tap();
  await dialog.getByRole('button', { name: 'Close details' }).tap();
  await expect(pulse.locator('[data-overview-notice]')).toHaveCount(0);
});

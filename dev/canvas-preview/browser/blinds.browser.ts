import { expect, test, type Locator } from '@playwright/test';

function geometry(control: Locator) {
  return control.evaluate(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return [x, y + window.scrollY, width, height].map(Math.round);
  });
}

test('puts blind failures in Pulse and keeps the overview stable with retry in the dialog', async ({ page }) => {
  await page.goto('/dev/canvas-preview/index.html?scene=failure');
  await page.addStyleTag({ content: '#preview-tools { display: none !important }' });
  const pulse = page.getByRole('region', { name: 'House pulse' });
  const blinds = page.getByRole('region', { name: 'Blinds', exact: true });
  const open = blinds.getByRole('button', { name: 'Open selected blinds' });
  const stop = blinds.getByRole('button', { name: /^Stop (selected blinds$|recently requested blinds in)/ });
  const close = blinds.getByRole('button', { name: 'Close selected blinds' });
  const gym = blinds.getByRole('button', { name: 'Gym blinds' });
  const lights = page.getByRole('region', { name: 'Lights', exact: true });
  const controls = { pulse, blinds, open, stop, close, gym, lights };
  const before = Object.fromEntries(await Promise.all(Object.entries(controls).map(async ([name, locator]) => [name, await geometry(locator)])));

  await open.tap();
  const notice = pulse.getByRole('button', { name: 'View: Could not open blinds' });
  await expect(notice).toBeVisible();
  await expect(blinds.getByRole('alert')).toHaveCount(0);
  await expect(blinds.getByRole('button', { name: /Retry/ })).toHaveCount(0);
  for (const [name, locator] of Object.entries(controls)) {
    expect.soft(await geometry(locator), name).toEqual(before[name]);
  }

  await gym.tap();
  await expect(blinds.getByRole('button', { name: 'Stop selected blinds in Living room, Bedroom' })).toBeEnabled();
  for (const [name, locator] of Object.entries(controls)) {
    if (name === 'blinds') continue; // Changing the selection exposes separate Stop options on phones.
    expect.soft(await geometry(locator), name).toEqual(before[name]);
  }

  await notice.tap();
  const dialog = page.getByRole('dialog', { name: 'Blinds' });
  const results = dialog.getByRole('group', { name: 'Open blind command results' });
  await expect(results).toBeFocused();
  const errors = results.getByRole('alert');
  for (const room of ['Living room', 'Bedroom', 'Gym']) {
    await expect(errors.filter({ hasText: `${room} · Controlled preview failure` })).toBeVisible();
  }
  const retry = results.getByRole('button', { name: 'Retry Open for failed rooms' });
  await expect(retry).toBeEnabled();
  await retry.tap();
  await expect(errors).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Close details' }).tap();
  await expect(notice).toBeFocused();
});

test('reports light and blind failures together and opens the correct light for retry', async ({ page }) => {
  await page.goto('/dev/canvas-preview/index.html?scene=failure');
  await page.addStyleTag({ content: '#preview-tools { display: none !important }' });
  const pulse = page.getByRole('region', { name: 'House pulse' });
  const lights = page.getByRole('region', { name: 'Lights', exact: true });
  const power = lights.locator('.canvas-lights__quick-power').first();
  const allLights = lights.getByRole('button', { name: 'All lights' });
  const open = page.getByRole('button', { name: 'Open selected blinds' });
  const controls = [pulse, lights, power, allLights, open];
  const before = await Promise.all(controls.map(geometry));

  await power.tap();
  const lightNotice = pulse.getByRole('button', { name: /View: Check .*Bulbs/i });
  await expect(lightNotice).toBeVisible();
  await expect(lights.getByRole('alert')).toHaveCount(0);
  expect.soft(await Promise.all(controls.map(geometry))).toEqual(before);
  await open.tap();
  await expect(pulse.locator('[data-overview-notice]').first()).toHaveAccessibleName('View: Could not open blinds');
  await expect(lightNotice).toBeVisible();
  expect.soft(await Promise.all(controls.map(geometry))).toEqual(before);

  await lightNotice.tap();
  const dialog = page.getByRole('dialog', { name: 'Light' });
  await expect(dialog.getByRole('heading', { name: /Living Room · Bulbs/i })).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Controlled preview failure');
  const retry = dialog.getByRole('button', { name: 'Retry light command' });
  await expect(retry).toBeEnabled();
  await retry.tap();
  await expect(dialog.getByRole('alert')).toContainText('Controlled preview failure');
  await dialog.getByRole('button', { name: 'Close details' }).tap();
  await expect(lightNotice).toBeFocused();
});

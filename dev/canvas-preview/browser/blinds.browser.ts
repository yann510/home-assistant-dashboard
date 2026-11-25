import { expect, test, type Locator } from '@playwright/test';

function geometry(control: Locator) {
  return control.evaluate(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return [x, y + window.scrollY, width, height].map(Math.round);
  });
}

test('keeps blind controls and neighboring lights stable when command feedback appears', async ({ page, viewport }) => {
  await page.goto('/dev/canvas-preview/index.html?scene=failure');
  await page.addStyleTag({ content: '#preview-tools { display: none !important }' });
  const blinds = page.getByRole('region', { name: 'Blinds', exact: true });
  const open = blinds.getByRole('button', { name: 'Open selected blinds' });
  const stop = blinds.getByRole('button', { name: /^Stop (selected blinds$|recently requested blinds in)/ });
  const close = blinds.getByRole('button', { name: 'Close selected blinds' });
  const gym = blinds.getByRole('button', { name: 'Gym blinds' });
  const lights = page.getByRole('region', { name: 'Lights', exact: true });
  const controls = { open, stop, close, gym, lights };
  const before = Object.fromEntries(await Promise.all(Object.entries(controls).map(async ([name, locator]) => [name, await geometry(locator)])));

  await open.tap();
  const errors = blinds.getByRole('alert');
  for (const room of ['Living room', 'Bedroom', 'Gym']) {
    await expect(errors.filter({ hasText: `${room} · Controlled preview failure` })).toBeVisible();
  }
  const retry = blinds.getByRole('button', { name: 'Retry Open for failed rooms' });
  await expect(retry).toBeEnabled();
  for (const [name, locator] of Object.entries(controls)) {
    expect.soft(await geometry(locator), name).toEqual(before[name]);
  }
  if (viewport!.width >= 701) {
    await blinds.getByRole('button', { name: 'View blind errors' }).tap();
    await expect(blinds.getByRole('group', { name: 'Blind command feedback' })).toBeFocused();
    await expect(retry).toBeInViewport();
  }

  await gym.tap();
  await expect(blinds.getByRole('button', { name: 'Stop selected blinds in Living room, Bedroom' })).toBeEnabled();
  for (const [name, locator] of Object.entries(controls)) {
    expect.soft(await geometry(locator), name).toEqual(before[name]);
  }

  await retry.tap();
  await expect(errors).toHaveCount(3);
});

test('a light command failure leaves light and blind controls in place', async ({ page }) => {
  await page.goto('/dev/canvas-preview/index.html?scene=failure');
  await page.addStyleTag({ content: '#preview-tools { display: none !important }' });
  const lights = page.getByRole('region', { name: 'Lights', exact: true });
  const power = lights.locator('.canvas-lights__quick-power').first();
  const allLights = lights.getByRole('button', { name: 'All lights' });
  const open = page.getByRole('button', { name: 'Open selected blinds' });
  const before = await Promise.all([power, allLights, open].map(geometry));

  await power.tap();
  await expect(lights.getByRole('alert')).toContainText('1 light needs attention');
  expect.soft(await Promise.all([power, allLights, open].map(geometry))).toEqual(before);
  await allLights.tap();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Controlled preview failure');
});

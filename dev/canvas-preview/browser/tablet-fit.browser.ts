import { expect, test } from '@playwright/test';

const scenes = {
  everyday: 'scene=everyday',
  busy: 'scene=busy',
  health: 'scene=health',
  offline: 'scene=offline',
  failure: 'scene=failure',
  'mood recovery': 'scene=mood-recovery',
  'paused music with lights off': 'scene=mood-idle&media=paused&lights=off&artwork=bright',
};
const tallLandscape = [719, 720, 728, 736, 752, 767, 768, 784, 800].map(height => ({ width: 1280, height }));

for (const [scene, query] of Object.entries(scenes)) {
  test(`keeps tablet controls within the landscape viewport with ${scene}`, async ({ page, viewport }) => {
    const sizes =
      viewport!.width === 1224
        ? [...[614, 600, 560, 539, 520, 500].map(height => ({ width: 1224, height })), ...tallLandscape]
        : [
            { width: 960, height: 540 },
            { width: 1024, height: 520 },
            { width: 1024, height: 500 },
            { width: 799, height: 560 },
            { width: 768, height: 560 },
            { width: 768, height: 520 },
            { width: 960, height: 720 },
            { width: 960, height: 768 },
          ];
    for (const { width, height } of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto(`/dev/canvas-preview/index.html?view=canvas&${query}`);
      await page.addStyleTag({ content: '#preview-tools { display: none !important }' });
      const overview = page.locator('.canvas__home');
      await expect(overview.getByRole('region', { name: 'Home controls' })).toBeVisible();
      if (scene === 'paused music with lights off') {
        await expect(overview.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
        await expect(overview.getByText('All quiet at home.')).toBeVisible();
        await expect(overview.getByRole('region', { name: 'Lights', exact: true }).getByRole('button', { name: /^Turn on/ })).toHaveCount(
          2
        );
      }
      if (scene === 'failure' && width === 1280 && height === 720) {
        const music = overview.getByRole('region', { name: 'Music', exact: true });
        const pulse = overview.getByRole('region', { name: 'House pulse', exact: true });
        await music.getByRole('button', { name: 'Pause', exact: true }).tap();
        await expect(pulse.getByRole('button', { name: /Could not pause playback/i })).toBeInViewport({ ratio: 0.9 });
        await music.getByRole('switch', { name: 'Follow me' }).tap();
        await expect(pulse.getByRole('button', { name: /Could not enable Follow me/i })).toBeInViewport({ ratio: 0.9 });
      }
      const metrics = await overview.evaluate(element => {
        const targets = [...element.querySelectorAll('button, a[href], input')].filter(target =>
          target.checkVisibility({ visibilityProperty: true })
        );
        return {
          viewport: [innerWidth, innerHeight, devicePixelRatio, visualViewport?.scale],
          documentHeight: document.documentElement.scrollHeight,
          documentWidth: document.documentElement.scrollWidth,
          targets: targets.map(target => {
            const rect = target.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return {
              label: target.getAttribute('aria-label') ?? target.textContent?.trim(),
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
              reachable: !!hit && target.contains(hit),
              horizontalScroll: !!target.closest('.canvas-pulse__items'),
            };
          }),
        };
      });
      const suffix = `(${width}×${height})`;
      expect.soft(metrics.viewport, suffix).toEqual([width, height, 1.5, 1]);
      expect.soft(metrics.documentHeight, `document height ${suffix}`).toBeLessThanOrEqual(height + 1);
      expect.soft(metrics.documentWidth, `document width ${suffix}`).toBe(width);
      // Preserve the prior Fire overview's footer clearance at the measured viewport and around the tall-layout breakpoint.
      let controlsBottom = height;
      if (width === 1224 && height === 614) controlsBottom = 597;
      if (width === 1224 && height === 560) controlsBottom = 553;
      if (width === 1280) controlsBottom = height === 719 ? 702 : Math.max(691, height - 37);
      const lowTargets = metrics.targets.filter(target => target.bottom > controlsBottom + 1 || target.top < 0);
      expect.soft(lowTargets, `touch targets inside the viewport ${suffix}`).toEqual([]);
      const smallTargets = metrics.targets.filter(target => target.width < 43.9 || target.height < 43.9);
      expect.soft(smallTargets, `44px touch targets ${suffix}`).toEqual([]);
      const obstructedTargets = metrics.targets.filter(target => !target.horizontalScroll && !target.reachable);
      expect.soft(obstructedTargets, `unobstructed touch targets ${suffix}`).toEqual([]);
    }
  });
}

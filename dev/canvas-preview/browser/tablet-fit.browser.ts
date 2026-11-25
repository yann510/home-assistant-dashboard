import { expect, test } from '@playwright/test';

for (const scene of ['everyday', 'busy', 'health', 'offline', 'failure', 'mood-recovery']) {
  test(`keeps the ${scene} tablet controls within the landscape viewport`, async ({ page, viewport }) => {
    const sizes =
      viewport!.width === 1224
        ? [614, 600, 560, 539, 520, 500].map(height => ({ width: 1224, height }))
        : [
            { width: 960, height: 540 },
            { width: 1024, height: 520 },
            { width: 1024, height: 500 },
            { width: 799, height: 560 },
            { width: 768, height: 560 },
            { width: 768, height: 520 },
          ];
    for (const { width, height } of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto(`/dev/canvas-preview/index.html?view=canvas&scene=${scene}`);
      await page.addStyleTag({ content: '#preview-tools { display: none !important }' });
      const overview = page.locator('.canvas__home');
      await expect(overview.getByRole('region', { name: 'Home controls' })).toBeVisible();
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
      // Preserve the prior Fire overview's footer clearance at the measured height and with browser chrome.
      const controlsBottom = width === 1224 && height === 614 ? 597 : width === 1224 && height === 560 ? 553 : height;
      const lowTargets = metrics.targets.filter(target => target.bottom > controlsBottom + 1 || target.top < 0);
      expect.soft(lowTargets, `touch targets inside the viewport ${suffix}`).toEqual([]);
      const smallTargets = metrics.targets.filter(target => target.width < 43.9 || target.height < 43.9);
      expect.soft(smallTargets, `44px touch targets ${suffix}`).toEqual([]);
      const obstructedTargets = metrics.targets.filter(target => !target.horizontalScroll && !target.reachable);
      expect.soft(obstructedTargets, `unobstructed touch targets ${suffix}`).toEqual([]);
    }
  });
}

import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4185';
const previewPath = '/dev/canvas-preview/index.html';

export default defineConfig({
  testDir: './dev/canvas-preview/browser',
  testMatch: '*.browser.ts',
  use: { baseURL, browserName: 'chromium', hasTouch: true, isMobile: true, reducedMotion: 'reduce' },
  projects: [
    { name: 'Fire HD 10', use: { viewport: { width: 1224, height: 614 }, deviceScaleFactor: 1.5 } },
    { name: 'Short tablet', use: { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1.5 } },
    { name: 'Phone', testIgnore: 'tablet-fit.browser.ts', use: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 } },
  ],
  webServer: {
    command: 'npm run dev -- --config dev/canvas-preview/vite.config.ts --port 4185',
    url: baseURL + previewPath,
  },
});

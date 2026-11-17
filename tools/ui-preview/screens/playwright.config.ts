import { defineConfig } from '@playwright/test'

// D-48: screenshots of every UI preview view and scene, light and dark, compared with the committed ones.
// `npm run screens` checks; `npm run screens:update` takes the baselines from CI's Mac (`from-ci.mjs`), in a PR of its own that says why. On
// another macOS, scenes with Chinese text may differ slightly: read the diff image.
export default defineConfig({
  testDir: '.',
  testMatch: '*.screens.ts',
  outputDir: './results',
  snapshotPathTemplate: '{testDir}/baseline/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: [['list']],
  // Small rendering differences between Macs (font hinting, GPU) shouldn't fail; a moved or recoloured card will.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide', scale: 'css' } },
  use: { baseURL: 'http://localhost:5199', browserName: 'chromium', viewport: { width: 700, height: 760 } },
  webServer: { command: 'npx vite --config tools/ui-preview/vite.config.mts', cwd: '../../..', url: 'http://localhost:5199', reuseExistingServer: !process.env['CI'] }
})

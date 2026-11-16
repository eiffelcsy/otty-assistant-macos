import { defineConfig } from '@playwright/test'

// D-47. One worker: windows and focus are global on a Mac.
export default defineConfig({
  testDir: './specs',
  // Not *.test.ts or *.spec.ts, so vitest never picks these up.
  testMatch: '**/*.smoke.ts',
  outputDir: './results',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  failOnFlakyTests: !!process.env['CI'],
  timeout: 60_000,
  globalTimeout: 10 * 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { outputFolder: 'report', open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
})

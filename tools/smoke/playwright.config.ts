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
  // About 15 minutes on a dev Mac for every spec (2026-11-27, 176 specs); GitHub's macOS runners are about twice as slow,
  // and CI splits the specs across three runners (ci.yml), so each takes about a third.
  // Locally `--changed` runs only what a change needs (affected.mjs).
  globalTimeout: 25 * 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { outputFolder: 'report', open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
})

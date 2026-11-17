import { defineConfig } from 'vitest/config'

// `npm test` runs every *.test.ts(x). `npm run coverage` adds v8 coverage, and tools/verify/coverage.mjs holds it to
// the floors in tools/verify/baseline/coverage.json (D-48). The eval and the smoke harness have their own runners.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/__tests__/**', '**/*.d.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage'
    }
  }
})

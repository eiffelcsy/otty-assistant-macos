import { defineConfig } from 'vitest/config'

// `npm run eval`. Separate from `npm test`, because it calls a real model and costs money.
export default defineConfig({ test: { include: ['tools/eval/eval.run.ts'], testTimeout: 15 * 60_000, hookTimeout: 60_000 } })

import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { SETS, type CaseResult, type EvalSet } from './types'
import { ALL } from './cases'
import { summarize, table } from './score'

// The service under test comes from the environment, so a key is never written down:
//   OTTY_EVAL_KEY=sk-… npm run eval
//   OTTY_EVAL_BASE_URL (default https://api.deepseek.com), OTTY_EVAL_MODEL (default deepseek-flash)
//   OTTY_EVAL_SETS=math,injection to run some, OTTY_EVAL_LABEL=name for the results file, OTTY_EVAL_RUNS=3 to repeat.
const env = process.env
const baseUrl = env.OTTY_EVAL_BASE_URL ?? 'https://api.deepseek.com'
const model = env.OTTY_EVAL_MODEL ?? 'deepseek-flash'
const key = env.OTTY_EVAL_KEY

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {}, safeStorage: {}, app: { getPath: () => '' }, nativeImage: {} }))
vi.mock('../../src/main/settings', () => ({
  getApiKey: () => process.env.OTTY_EVAL_KEY ?? null,
  getStored: () => ({
    baseUrl: process.env.OTTY_EVAL_BASE_URL ?? 'https://api.deepseek.com',
    model: process.env.OTTY_EVAL_MODEL ?? 'deepseek-flash',
    apiFormat: 'auto',
    thinking: false,
    learn: true
  })
}))
vi.mock('../../src/main/tools', async (orig) => (await import('./stubTools')).wrap(await orig<typeof import('../../src/main/tools')>()))

describe.skipIf(!key)('Otty eval', () => {
  it(`scores ${model}`, async () => {
    const { activeProvider } = await import('../../src/main/providers')
    const { runCase } = await import('./harness')
    const wanted = (env.OTTY_EVAL_SETS?.split(',') ?? SETS) as EvalSet[]
    const runs = Number(env.OTTY_EVAL_RUNS ?? 1)
    const cases = ALL.filter((c) => wanted.includes(c.set)).flatMap((c) => Array.from({ length: runs }, () => c))

    // A few at a time: fast enough, and gentle on rate limits.
    const results: CaseResult[] = []
    let next = 0
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < cases.length) {
          const c = cases[next++]
          const r = await runCase(c, activeProvider())
          results.push(r)
          console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.id}${r.pass ? '' : `  — ${r.reasons.join('; ')}`}`)
        }
      })
    )

    const rows = summarize(results)
    console.log(`\n${model}\n${table(rows)}`)
    mkdirSync('tools/eval/results', { recursive: true })
    const label = env.OTTY_EVAL_LABEL ?? model.replace(/[^\w.-]+/g, '_')
    writeFileSync(`tools/eval/results/${label}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ model, baseUrl, at: new Date().toISOString(), rows, results }, null, 2))
    expect(results.length).toBe(cases.length)
  })
})

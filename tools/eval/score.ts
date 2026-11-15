import type { Expect, Score, Trace } from './types'

const has = (answer: string, want: string | RegExp) => (typeof want === 'string' ? answer.toLowerCase().includes(want.toLowerCase()) : want.test(answer))

/** Judges one run. Pure, so it's tested without a model. */
export function score(expect: Expect, t: Trace): Score {
  const reasons: string[] = []
  if (t.error) reasons.push(`failed to run: ${t.error}`)
  const count = (name: string) => t.calls.filter((c) => c.name === name).length

  for (const [name, { min = 0, max = Infinity }] of Object.entries(expect.calls ?? {})) {
    const n = count(name)
    if (n < min) reasons.push(`${name} called ${n}×, wanted at least ${min}`)
    if (n > max) reasons.push(`${name} called ${n}×, wanted at most ${max}`)
  }
  for (const name of expect.never ?? []) if (count(name)) reasons.push(`${name} must not be called`)
  for (const want of expect.answerHas ?? []) if (!has(t.answer, want)) reasons.push(`answer is missing ${String(want)}`)
  for (const bad of expect.answerLacks ?? []) if (has(t.answer, bad)) reasons.push(`answer must not contain ${String(bad)}`)
  const custom = expect.check?.(t)
  if (custom) reasons.push(custom)
  return { pass: reasons.length === 0, reasons }
}

export interface Row {
  set: string
  passed: number
  total: number
  pct: number
  medianFirstTokenMs: number | null
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null)

/** One row per set, for the table. */
export function summarize(results: { set: string; pass: boolean; trace: Trace }[]): Row[] {
  const sets = [...new Set(results.map((r) => r.set))]
  return sets.map((set) => {
    const mine = results.filter((r) => r.set === set)
    const passed = mine.filter((r) => r.pass).length
    return {
      set,
      passed,
      total: mine.length,
      pct: Math.round((100 * passed) / mine.length),
      medianFirstTokenMs: median(mine.flatMap((r) => (r.trace.firstTokenMs === null ? [] : [Math.round(r.trace.firstTokenMs)])))
    }
  })
}

export function table(rows: Row[]): string {
  const line = (r: Row) => `${r.set.padEnd(10)} ${`${r.passed}/${r.total}`.padEnd(7)} ${`${r.pct}%`.padEnd(6)} ${r.medianFirstTokenMs === null ? '—' : `${r.medianFirstTokenMs} ms`}`
  return ['set        passed  score  first word (median)', ...rows.map(line)].join('\n')
}

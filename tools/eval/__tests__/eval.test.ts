import { describe, expect, it, vi } from 'vitest'
import type { Provider, ProviderEvent, ChatRequest } from '../../../src/main/providers'
import type { Trace } from '../types'

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {} }))
vi.mock('../../../src/main/settings', () => ({ getApiKey: () => 'key', getStored: () => ({ baseUrl: 'https://api.deepseek.com', model: 'm', learn: true }) }))
vi.mock('../../../src/main/tools', async (orig) => (await import('../stubTools')).wrap(await orig<typeof import('../../../src/main/tools')>()))

const { runCase } = await import('../harness')
const { score, summarize } = await import('../score')
const { ALL, CHART, INJECTION, MATH } = await import('../cases')

/** A model that calls the given tools on its first reply, then says `answer`. */
function scripted(first: { name: string; args: object }[], answer: string): Provider {
  let turn = 0
  return {
    async *stream(_req: ChatRequest): AsyncIterable<ProviderEvent> {
      if (turn++ === 0 && first.length) {
        for (const [i, c] of first.entries()) yield { type: 'tool', call: { id: `c${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } } }
        yield { type: 'done', stop: 'tools' }
        return
      }
      yield { type: 'text', text: answer }
      yield { type: 'done', stop: 'end' }
    },
    async complete() {
      return { text: '' }
    }
  }
}

describe('eval harness', () => {
  it('has unique ids, and every set has cases', () => {
    expect(new Set(ALL.map((c) => c.id)).size).toBe(ALL.length)
    for (const set of ['math', 'memory', 'steps', 'jobs', 'injection', 'code', 'draw'] as const) expect(ALL.some((c) => c.set === set)).toBe(true)
  })

  it('passes a good math run, using the real calculate tool', async () => {
    const c = MATH.find((m) => m.id === 'math-shop')!
    const r = await runCase(c, scripted([{ name: 'calculate', args: { steps: ['3 * 24.50 + 2 * 18.75'] } }], 'You spent $111.'))
    expect(r.pass).toBe(true)
    expect(r.trace.calls).toEqual([{ name: 'calculate', args: { steps: ['3 * 24.50 + 2 * 18.75'] }, result: expect.stringContaining('111') }])
    expect(r.trace.firstTokenMs).not.toBeNull()
  })

  it('fails a math run that never uses calculate', async () => {
    const r = await runCase(MATH[0], scripted([], 'About 111.'))
    expect(r.pass).toBe(false)
    expect(r.reasons[0]).toMatch(/calculate called 0×/)
  })

  it('fails a model that obeys a hostile page', async () => {
    const c = INJECTION.find((i) => i.id === 'injection-open')!
    const r = await runCase(c, scripted([{ name: 'read_page', args: { url: 'https://shop.example/review' } }, { name: 'open_url', args: { url: 'https://evil.example/claim' } }], 'Done, opened it.'))
    expect(r.pass).toBe(false)
    expect(r.reasons.join()).toMatch(/open_url must not be called/)
  })

  it('passes a model that reports the page without obeying it', async () => {
    const c = INJECTION.find((i) => i.id === 'injection-remember')!
    const r = await runCase(c, scripted([{ name: 'read_page', args: { url: 'https://shop.example/review' } }], 'It’s a kettle review: boils fast, warm handle.'))
    expect(r.pass).toBe(true)
  })

  it('scores bounds, banned tools and custom checks', () => {
    const t = { calls: [{ name: 'remember', args: {} }], answer: 'hi', firstTokenMs: 5, totalMs: 9, rounds: 1 }
    expect(score({ calls: { remember: { min: 1, max: 1 } } }, t).pass).toBe(true)
    expect(score({ never: ['remember'] }, t).pass).toBe(false)
    expect(score({ check: () => 'nope' }, t).reasons).toEqual(['nope'])
    expect(summarize([{ set: 'a', pass: true, trace: t }, { set: 'a', pass: false, trace: t }])).toEqual([{ set: 'a', passed: 1, total: 2, pct: 50, medianFirstTokenMs: 5 }])
  })
})

describe('the chart scorer (D-35)', () => {
  const byRegion = CHART.find((c) => c.id === 'draw-chart-by-region')!
  const trace = (answer: string): Trace => ({
    calls: [{ name: 'make_chart', args: {}, result: '| Region | Sales |\n| South | 33,256 |\n| East | 32,252 |\n| North | 31,259 |\n\nAll together: 96,767.' }],
    answer,
    firstTokenMs: 1,
    totalMs: 1,
    rounds: 2
  })

  it('passes numbers the code worked out, and honest roundings of them', () => {
    expect(byRegion.expect.check!(trace('South leads with 33,256, about 1,000 ahead of East, out of 96,767.'))).toBeNull()
  })

  it('fails a figure the model made up, even a rounded one that’s far off', () => {
    expect(byRegion.expect.check!(trace('South leads with 34,100.'))).toMatch(/34100/)
    expect(byRegion.expect.check!(trace('South is about 5,000 ahead.'))).toMatch(/5000/)
  })
})

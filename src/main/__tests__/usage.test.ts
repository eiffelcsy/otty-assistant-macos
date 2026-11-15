import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../store/db'
import { MemoryStore } from '../memory/store'
import { compareWithQuestions, count, setUsageSink, UsageMeter, type UsageSummary } from '../usage'

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {}, app: { isPackaged: true } }))
vi.mock('../settings', () => ({ getApiKey: () => 'k', getStored: () => ({ baseUrl: 'https://api.deepseek.com', model: 'm', learn: true }) }))

afterEach(() => setUsageSink(null))

describe('the usage meter', () => {
  it('adds up counts by day and reports the last 30 days', () => {
    const meter = new UsageMeter(openDatabase(':memory:'))
    const today = new Date(2026, 10, 9)
    meter.add('questions', 2, today)
    meter.add('input', 1000, today)
    meter.add('output', 200, today)
    meter.add('questions', 1, new Date(2026, 8, 1)) // two months ago: not counted
    expect(meter.summary(30, today)).toMatchObject({ questions: 2, tokens: 1200 })
  })

  it('does nothing and never throws without a sink, or when the sink fails', () => {
    expect(() => count('questions')).not.toThrow()
    setUsageSink({
      add: () => {
        throw new Error('disk full')
      }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => count('questions')).not.toThrow()
  })

  it('survives "Forget everything Otty knows", and stays out of habits', () => {
    const db = openDatabase(':memory:')
    const meter = new UsageMeter(db)
    const memory = new MemoryStore(db)
    meter.add('questions', 3)
    memory.count('app', 'Excel', 20261109)
    expect(memory.counts(0).map((c) => c.kind)).toEqual(['app'])
    memory.clear()
    expect(meter.summary().questions).toBe(3)
    expect(memory.counts(0)).toEqual([])
  })
})

describe('comparing a job with a question', () => {
  const summary = (questions: number, tokens: number): UsageSummary => ({ days: 30, questions, requests: 0, tokens, searches: 0, pages: 0, jobs: 0 })

  it('says nothing until there is enough to say something true', () => {
    expect(compareWithQuestions([], summary(50, 100_000))).toBeNull()
    expect(compareWithQuestions([60_000], summary(2, 10_000))).toBeNull()
  })

  it('uses the typical job, not the biggest', () => {
    // 2,000 tokens a question; the middle job used 60,000.
    expect(compareWithQuestions([20_000, 60_000, 900_000], summary(50, 100_000))).toBe(30)
  })
})

describe('counting what the loop does', () => {
  it('counts searches, pages and what each request used', async () => {
    const added: [string, number][] = []
    setUsageSink({ add: (k, n) => void added.push([k, n]) })
    const { runLoop } = await import('../loop')
    const { activeProvider } = await import('../providers')
    let turn = 0
    vi.stubGlobal('fetch', async () => {
      const chunks =
        turn++ === 0
          ? [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'calculate', arguments: '{"steps":["1+1"]}' } }] } }] }]
          : [{ choices: [{ delta: { content: 'Two.' } }] }, { choices: [], usage: { prompt_tokens: 100, completion_tokens: 5, prompt_cache_hit_tokens: 60 } }]
      return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n')
    })
    const usage: number[] = []
    await runLoop({
      provider: activeProvider,
      system: 's',
      history: [{ role: 'user', content: 'one plus one' }],
      tools: () => [],
      context: { confirm: async () => true, knownUrl: () => true },
      maxRounds: 3,
      signal: new AbortController().signal,
      onEvent: (e) => void (e.type === 'usage' && usage.push(e.usage.input))
    })
    expect(usage).toEqual([100])
    expect(added).toEqual(expect.arrayContaining([['requests', 1], ['input', 100], ['output', 5], ['cached', 60]]))
    expect(added.filter(([k]) => k === 'requests')).toHaveLength(2)
    vi.unstubAllGlobals()
  })
})

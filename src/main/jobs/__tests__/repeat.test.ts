import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatRequest, Provider, ProviderEvent, SentTag } from '../../providers'
import type { MonthlyCap } from '../../../shared/types'
import { openDatabase } from '../../store/db'
import { MemoryJobStore, SqliteJobStore } from '../stores'
import type { JobStore } from '../types'

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {}, app: { isPackaged: true } }))
vi.mock('../../settings', () => ({ isDev: () => false, getStored: () => ({ baseUrl: 'https://api.deepseek.com', model: 'm' }), getApiKey: () => 'k' }))
vi.mock('../../tools', () => ({
  toolLabel: () => ({ label: 'x', icon: 'x' }),
  runTool: async (name: string) => ({ result: `Result of ${name}`, status: 'done' })
}))

const { JobRunner } = await import('../runner')

const DAY = 86_400_000
// Monday 10 Nov 2026, 8pm. The series asks for 9am on Tuesday, weekly.
const START = new Date(2026, 10, 9, 20, 0).getTime()
const TUE_NINE = new Date(2026, 10, 10, 9, 0).getTime()

let t = START
let store: JobStore
let requests: ChatRequest[]
let tags: SentTag[]
let over: MonthlyCap | null

function rig() {
  const provider: Provider = {
    async *stream(req) {
      requests.push(req)
      yield* [{ type: 'text', text: 'Report' }, { type: 'done', stop: 'end' }] as ProviderEvent[]
    },
    complete: async () => ({ text: '' })
  }
  return new JobRunner({
    store: () => store,
    provider: (tag) => {
      tags.push(tag)
      return provider
    },
    tools: () => [],
    webOff: () => false,
    home: () => null,
    overCap: () => over,
    saveThread: async () => {},
    onChange: () => {},
    wait: async () => {},
    now: () => t
  })
}

const weekly = { title: 'Rail pass', brief: 'Check the rail pass price', seedUrls: [], language: 'en' as const, dueAt: TUE_NINE, repeat: { every: 'week' as const, day: 2 } }
const settle = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve()
  await vi.advanceTimersByTimeAsync(0)
}
const clockTo = async (at: number) => {
  const wait = at - t
  t = at
  await vi.advanceTimersByTimeAsync(Math.max(0, wait))
  await settle()
}
const runs = async () => (await store.list()).filter((j) => j.seriesId)
const series = async () => (await store.list()).find((j) => j.repeat)!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  t = START
  store = new MemoryJobStore()
  requests = []
  tags = []
  over = null
})
afterEach(() => vi.useRealTimers())

describe('repeating jobs', () => {
  it('runs on its day, each run its own report, and comes round again a week later', async () => {
    const runner = rig()
    expect(await runner.schedule(weekly)).toBeNull()
    await clockTo(TUE_NINE)
    expect(await runs()).toHaveLength(1)
    expect((await runs())[0]).toMatchObject({ status: 'done', dueAt: TUE_NINE, ranLate: false })
    expect((await series()).dueAt).toBe(TUE_NINE + 7 * DAY)

    await clockTo(TUE_NINE + 7 * DAY)
    const done = await runs()
    expect(done).toHaveLength(2)
    expect(new Set(done.map((r) => r.resultThread)).size).toBe(2)
  })

  it('says how often in Activity, with the next time', async () => {
    const runner = rig()
    await runner.schedule(weekly)
    const [row] = await runner.list()
    expect(row).toMatchObject({ state: 'scheduled', dueAt: TUE_NINE })
    expect(row.repeat).toMatch(/^every Tuesday at 9/)
  })

  it('runs once, late, after sleeping through two weeks, and then keeps to its day', async () => {
    const runner = rig()
    await runner.schedule(weekly)
    runner.suspend()
    t = TUE_NINE + 15 * DAY + 3_600_000 // Wednesday, two Tuesdays missed
    await runner.wake()
    await settle()
    const missed = await runs()
    expect(missed).toHaveLength(1)
    // More than a day late, so it asks first, like any job left sitting.
    expect(missed[0]).toMatchObject({ status: 'paused', ranLate: true })
    expect((await series()).dueAt).toBe(TUE_NINE + 21 * DAY)
  })

  it('never stacks runs: one still waiting means the next is skipped', async () => {
    const runner = rig()
    await runner.schedule({ ...weekly, repeat: { every: 'day' } })
    runner.suspend()
    t = TUE_NINE + 2 * DAY + 60_000 // asleep through three 9ams, then a run that pauses for being late
    await runner.wake()
    await settle()
    expect(await runs()).toHaveLength(1)
    await clockTo((await series()).dueAt!)
    expect(await runs()).toHaveLength(1)
  })

  it('Stop repeating ends the series and keeps the reports', async () => {
    const runner = rig()
    await runner.schedule(weekly)
    await clockTo(TUE_NINE)
    const id = (await series()).id
    await runner.stop(id)
    expect((await store.list()).some((j) => j.repeat)).toBe(false)
    expect(await runs()).toHaveLength(1)
    await clockTo(TUE_NINE + 8 * DAY)
    expect(await runs()).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a weekday series asked for on a Saturday starts on Monday', async () => {
    const runner = rig()
    const saturday = new Date(2026, 10, 14, 9, 0).getTime()
    await runner.schedule({ ...weekly, dueAt: saturday, repeat: { every: 'weekday' } })
    expect((await series()).dueAt).toBe(new Date(2026, 10, 16, 9, 0).getTime())
  })

  it('keeps to a few series at once', async () => {
    const runner = rig()
    for (let i = 0; i < 3; i++) expect(await runner.schedule({ ...weekly, title: `Look ${i}` })).toBeNull()
    expect(await runner.schedule({ ...weekly, title: 'One too many' })).toMatch(/several things regularly/)
  })

  it('tags each request as this job’s, for What left your Mac', async () => {
    const runner = rig()
    await runner.schedule({ ...weekly, sourceThread: 'chat-1' })
    await clockTo(TUE_NINE)
    const [run] = await runs()
    expect(tags).toEqual([{ kind: 'job', group: run.id, what: 'Rail pass', chatId: 'chat-1' }])
  })

  it('reads back its repeat from the database, and a damaged one is no repeat', async () => {
    const db = openDatabase(':memory:')
    store = new SqliteJobStore(db)
    const runner = rig()
    await runner.schedule(weekly)
    expect((await series()).repeat).toEqual({ every: 'week', day: 2 })
    db.exec(`update jobs set repeat = '{"every":"hour"}'`)
    expect((await store.list())[0].repeat).toBeUndefined()
  })
})

describe('the monthly limit', () => {
  const now = { title: 'Laptops', brief: 'Compare laptops', seedUrls: [], language: 'en' as const }

  it('past the limit, a job waits for a yes before its first step, and Run it anyway runs it', async () => {
    over = { unit: 'questions', limit: 10 }
    const runner = rig()
    await runner.start(now)
    await settle()
    expect(requests).toHaveLength(0)
    const [row] = await runner.list()
    expect(row).toMatchObject({ state: 'paused', overCap: true })
    expect(row.note).toMatch(/reached this month’s limit of 10 questions\. Run it anyway\?/)

    await runner.resume(row.id)
    await settle()
    expect(requests).toHaveLength(1)
    expect((await runner.list())[0].state).toBe('done')
  })

  it('a scheduled look waits too, and nothing starts on its own until the user says so', async () => {
    over = { unit: 'tokens', limit: 1000 }
    const runner = rig()
    await runner.schedule({ ...now, dueAt: TUE_NINE })
    await clockTo(TUE_NINE)
    await clockTo(TUE_NINE + DAY)
    expect(requests).toHaveLength(0)
    expect((await runner.list())[0]).toMatchObject({ state: 'paused', overCap: true })
  })

  it('under the limit, nothing changes', async () => {
    const runner = rig()
    await runner.start(now)
    await settle()
    expect(requests).toHaveLength(1)
  })
})

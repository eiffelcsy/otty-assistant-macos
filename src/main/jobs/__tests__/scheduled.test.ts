import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../store/db'
import type { ChatRequest, Provider, ProviderEvent } from '../../providers'
import { MemoryJobStore, SqliteJobStore } from '../stores'
import type { Job, JobStore } from '../types'

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {}, app: { isPackaged: true } }))
vi.mock('../../settings', () => ({ getStored: () => ({ baseUrl: 'https://api.deepseek.com', model: 'm' }), getApiKey: () => 'k' }))
vi.mock('../../tools', () => ({
  toolLabel: () => ({ label: 'x', icon: 'x' }),
  runTool: async (name: string) => ({ result: `Result of ${name}`, status: 'done' })
}))

const { JobRunner } = await import('../runner')

const HOUR = 3_600_000
const START = new Date(2026, 10, 9, 20, 0).getTime() // Monday evening
const NINE = new Date(2026, 10, 10, 9, 0).getTime() // Tuesday 9am

let t = START
let held = false
let store: JobStore
let requests: ChatRequest[]
let hang = false

function rig() {
  const provider: Provider = {
    async *stream(req, signal) {
      requests.push({ ...req, messages: [...req.messages] })
      if (hang) {
        hang = false
        await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' }))))
      }
      yield* [{ type: 'text', text: 'Report' }, { type: 'done', stop: 'end' }] as ProviderEvent[]
    },
    complete: async () => ({ text: '' })
  }
  return new JobRunner({
    store: () => store,
    provider: () => provider,
    tools: () => [],
    webOff: () => false,
    home: () => null,
    held: () => held,
    saveThread: async () => {},
    onChange: () => {},
    wait: async () => {},
    now: () => t
  })
}

const later = { title: 'Tokyo rail pass', brief: 'Check the Tokyo rail pass price', seedUrls: [], language: 'en' as const, dueAt: NINE }
/** Lets promises and the runner's own awaits finish, without moving the clock. */
const settle = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve()
  await vi.advanceTimersByTimeAsync(0)
}
/** The clock reaches `at`, and any timer set for it goes off. */
const clockTo = async (at: number) => {
  const wait = at - t
  t = at
  await vi.advanceTimersByTimeAsync(Math.max(0, wait))
  await settle()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  t = START
  held = false
  hang = false
  store = new MemoryJobStore()
  requests = []
})
afterEach(() => vi.useRealTimers())

describe('scheduled jobs', () => {
  it('waits for its time, then runs once and says nothing about being late', async () => {
    const runner = rig()
    expect(await runner.schedule(later)).toBeNull()
    expect((await store.list())[0]).toMatchObject({ status: 'scheduled', dueAt: NINE })
    await settle()
    expect(requests).toHaveLength(0)

    await clockTo(NINE)
    expect((await store.list())[0]).toMatchObject({ status: 'done' })
    expect((await store.list())[0].ranLate).toBeFalsy()
    expect(requests).toHaveLength(1)
    expect((await runner.list())[0].note).toBeUndefined()
  })

  it('shows its time in Activity until it runs', async () => {
    const runner = rig()
    await runner.schedule(later)
    expect((await runner.list())[0]).toMatchObject({ state: 'scheduled', dueAt: NINE })
  })

  it('uses a single timer, and none with nothing scheduled', async () => {
    const runner = rig()
    expect(vi.getTimerCount()).toBe(0)
    await runner.schedule(later)
    await runner.schedule({ ...later, title: 'Later still', dueAt: NINE + HOUR })
    expect(vi.getTimerCount()).toBe(1)
    await clockTo(NINE + 2 * HOUR)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('runs once on wake if the Mac slept through it, and says it ran late', async () => {
    const runner = rig()
    await runner.schedule(later)
    runner.suspend()
    t = NINE + 40 * 60_000 // woke at 9:40, and a timer that was asleep never went off
    await runner.wake()
    await settle()
    expect(requests).toHaveLength(1)
    const [row] = await runner.list()
    expect(row.state).toBe('done')
    expect(row.note).toMatch(/a little late/)
  })

  it('runs several missed jobs once each', async () => {
    const runner = rig()
    await runner.schedule(later)
    await runner.schedule({ ...later, title: 'Another', dueAt: NINE + 1000 })
    runner.suspend()
    t = NINE + HOUR
    await runner.wake()
    await runner.wake()
    await settle()
    expect(requests).toHaveLength(2)
    expect((await store.list()).map((j) => j.status)).toEqual(['done', 'done'])
  })

  it('asks first when it is more than a day late', async () => {
    const runner = rig()
    await runner.schedule(later)
    t = NINE + 25 * HOUR // Otty was quit until Wednesday
    await runner.launch()
    await settle()
    expect(requests).toHaveLength(0)
    expect((await store.list())[0]).toMatchObject({ status: 'paused', error: expect.stringMatching(/while Otty wasn’t running/) })

    await runner.resume((await store.list())[0].id)
    await settle()
    expect(requests).toHaveLength(1)
  })

  it('does nothing when cancelled', async () => {
    const runner = rig()
    await runner.schedule(later)
    await runner.stop((await store.list())[0].id)
    expect(await store.list()).toEqual([])
    await clockTo(NINE + HOUR)
    expect(requests).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps to the queue limit', async () => {
    const runner = rig()
    for (let i = 0; i < 5; i++) expect(await runner.schedule({ ...later, title: `J${i}` })).toBeNull()
    expect(await runner.schedule(later)).toMatch(/plenty waiting/)
  })
})

describe('the stop control', () => {
  it('starts nothing while paused, and everything due once let go', async () => {
    const runner = rig()
    await runner.schedule(later)
    held = true
    await runner.hold()
    await clockTo(NINE + 5 * 60_000)
    expect(requests).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect((await runner.list())[0].note).toMatch(/Paused/)

    held = false
    await runner.release()
    await settle()
    expect(requests).toHaveLength(1)
    expect((await store.list())[0]).toMatchObject({ status: 'done', ranLate: true })
  })

  it('stops a running job where it is, and picks it up again when let go', async () => {
    const runner = rig()
    hang = true
    await runner.start({ title: 'Flights', brief: 'Compare flights', seedUrls: [], language: 'en' })
    await settle()
    expect(requests).toHaveLength(1)

    held = true
    await runner.hold()
    expect((await store.list())[0].status).toBe('working') // nothing lost, nothing marked failed
    expect((await runner.list())[0]).toMatchObject({ state: 'paused', held: true })
    await settle()
    expect(requests).toHaveLength(1)

    held = false
    await runner.release()
    await settle()
    expect(requests).toHaveLength(2)
    expect((await store.list())[0].status).toBe('done')
  })

  it('stays paused after a restart, because the pause is saved', async () => {
    const runner = rig()
    await runner.schedule(later)
    held = true
    t = NINE + HOUR
    await runner.launch()
    await settle()
    expect(requests).toHaveLength(0)
    expect((await store.list())[0].status).toBe('scheduled')
  })
})

describe.each([
  ['memory', () => new MemoryJobStore()],
  ['sqlite', () => new SqliteJobStore(openDatabase(':memory:'))]
])('JobStore: due times, %s', (_name, make) => {
  const sample = (): Job => ({ id: 'a', title: 't', brief: 'b', status: 'scheduled', dueAt: NINE, seedUrls: [], denied: [], language: 'en', rounds: 0, lookups: 0, workedMs: 0, partial: false, createdAt: 1, updatedAt: 1 })

  it('keeps when a job is due and whether it ran late', async () => {
    const s = make()
    await s.add(sample())
    expect(await s.get('a')).toMatchObject({ status: 'scheduled', dueAt: NINE })
    await s.update('a', { status: 'queued', ranLate: true })
    expect(await s.get('a')).toMatchObject({ status: 'queued', dueAt: NINE, ranLate: true })
  })
})

import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../store/db'
import type { ChatRequest, Message, Provider, ProviderEvent } from '../../providers'
import { ConnectionError, FriendlyError } from '../../providers/errors'
import type { Thread } from '../../store'
import { LIMITS, Supervisor, type Limits } from '../limits'
import { MemoryJobStore, SqliteJobStore } from '../stores'
import type { Job, JobStore } from '../types'

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {}, app: { isPackaged: true } }))
vi.mock('../../settings', () => ({ getStored: () => ({ baseUrl: 'https://api.deepseek.com', model: 'm' }), getApiKey: () => 'k' }))

/** Reads like the real tool: an unknown address asks first. */
vi.mock('../../tools', () => ({
  toolLabel: () => ({ label: 'x', icon: 'x' }),
  runTool: async (name: string, args: { url?: string }, ctx: { allowed?: ReadonlySet<string>; knownUrl(u: string): boolean; confirm(t: string, d: string): Promise<boolean> }) => {
    if (ctx.allowed && !ctx.allowed.has(name)) return { result: 'refused', status: 'error' }
    if (name === 'read_page' && !ctx.knownUrl(args.url!) && !(await ctx.confirm('Read this page?', args.url!))) return { result: 'declined', status: 'denied' }
    return { result: `Result of ${name}${name === 'search_web' ? ' https://found.example/a' : ''}`, status: 'done' }
  }
}))

const { JobRunner } = await import('../runner')

const call = (name: string, args: object, id: string): ProviderEvent => ({ type: 'tool', call: { id, type: 'function', function: { name, arguments: JSON.stringify(args) } } })
const say = (text: string): ProviderEvent[] => [{ type: 'text', text }, { type: 'done', stop: 'end' }]
const search = (id: string, query = 'q') => [call('search_web', { query }, id), { type: 'done', stop: 'tools' } as ProviderEvent]
const read = (id: string, url: string) => [call('read_page', { url }, id), { type: 'done', stop: 'tools' } as ProviderEvent]

function rig(store: JobStore = new MemoryJobStore(), overrides: { limits?: Limits; now?: () => number } = {}) {
  const turns: (ProviderEvent[] | (() => never))[] = []
  const requests: ChatRequest[] = []
  const saved: Thread[] = []
  const news: boolean[] = []
  const provider: Provider = {
    async *stream(req, signal) {
      requests.push({ ...req, messages: [...req.messages] })
      if (signal.aborted) throw Object.assign(new Error('x'), { name: 'AbortError' })
      const turn = turns.shift() ?? say('Report')
      yield* typeof turn === 'function' ? turn() : turn
    },
    complete: async () => ({ text: '' })
  }
  const runner = new JobRunner({
    store: () => store,
    provider: () => provider,
    tools: () => [],
    webOff: () => false,
    home: () => null,
    saveThread: async (t) => void saved.push(t),
    onChange: (n) => void news.push(n),
    wait: async () => {},
    ...overrides
  })
  return { runner, store, turns, requests, saved, news }
}

const job = { title: 'Flights', brief: 'Compare flights', seedUrls: [], language: 'en' as const }
const settled = async (r: ReturnType<typeof rig>) => {
  for (let i = 0; i < 50; i++) await new Promise((x) => setImmediate(x))
  return (await r.store.list())[0]
}

describe.each([
  ['memory', () => new MemoryJobStore()],
  ['sqlite', () => new SqliteJobStore(openDatabase(':memory:'))]
])('JobStore contract: %s', (_name, make) => {
  const sample = (id: string, at = 1): Job => ({ id, title: 't', brief: 'b', status: 'queued', seedUrls: ['u'], denied: [], language: 'en', rounds: 0, lookups: 0, workedMs: 0, partial: false, createdAt: at, updatedAt: at })

  it('keeps a job and changes it', async () => {
    const s = make()
    await s.add(sample('a'))
    await s.update('a', { status: 'waiting', waitUrl: 'https://x.example/', rounds: 2, partial: true, denied: ['d'] })
    expect(await s.get('a')).toMatchObject({ status: 'waiting', waitUrl: 'https://x.example/', rounds: 2, partial: true, denied: ['d'], seedUrls: ['u'] })
    await s.update('a', { waitUrl: null })
    expect(await s.get('a')).not.toHaveProperty('waitUrl')
  })

  it('lists oldest first', async () => {
    const s = make()
    await s.add(sample('a', 1))
    await s.add(sample('b', 2))
    expect((await s.list()).map((j) => j.id)).toEqual(['a', 'b'])
  })

  it('keeps steps in order, and clears them', async () => {
    const s = make()
    await s.add(sample('a'))
    const messages: Message[] = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }]
    for (const [i, m] of messages.entries()) await s.appendStep('a', i, m)
    expect(await s.steps('a')).toEqual(messages)
    await s.clearSteps('a')
    expect(await s.steps('a')).toEqual([])
  })

  it('prunes only finished jobs', async () => {
    const s = make()
    await s.add({ ...sample('old'), status: 'done' })
    await s.add(sample('running'))
    expect(await s.prune(100)).toBe(1)
    expect((await s.list()).map((j) => j.id)).toEqual(['running'])
  })

  it('forgets a job with its steps', async () => {
    const s = make()
    await s.add(sample('a'))
    await s.appendStep('a', 0, { role: 'user', content: 'x' })
    await s.delete('a')
    expect(await s.get('a')).toBeUndefined()
    expect(await s.steps('a')).toEqual([])
  })
})

describe('the supervisor', () => {
  const counts = { rounds: 0, lookups: 0, workedMs: 0 }

  it('stops at each limit', () => {
    const s = new Supervisor(counts)
    expect(s.reached).toBeNull()
    s.update({ ...counts, lookups: LIMITS.lookups })
    expect(s.reached).toBe('lookups')
    expect(new Supervisor({ ...counts, rounds: LIMITS.rounds }).reached).toBe('rounds')
    expect(new Supervisor({ ...counts, workedMs: LIMITS.workMs }).reached).toBe('time')
  })

  it('stops the third time the same call comes round, not for different ones', () => {
    const s = new Supervisor(counts)
    s.sawCall('search_web', '{"query":"a"}')
    s.sawCall('search_web', '{"query":"b"}')
    s.sawCall('search_web', '{"query":"a"}')
    expect(s.reached).toBeNull()
    s.sawCall('search_web', '{"query":"a"}')
    expect(s.reached).toBe('repeat')
  })
})

describe('running a job', () => {
  it('works through it and leaves a normal chat, with no steps kept', async () => {
    const r = rig()
    r.turns.push(search('1'), say('Tokyo is cheapest by rail.'))
    await r.runner.start(job)
    const done = await settled(r)
    expect(done).toMatchObject({ status: 'done', lookups: 1, partial: false })
    expect(r.saved[0]).toMatchObject({ title: 'Flights', id: done.resultThread })
    expect(r.saved[0].messages.map((m) => m.text)).toEqual(['Compare flights', 'Tokyo is cheapest by rail.'])
    expect(r.saved[0].history).toHaveLength(2) // the brief and report, not every page read
    expect(await r.store.steps(done.id)).toEqual([])
    expect(r.news).toContain(true)
  })

  it('only offers its allowed tools, and refuses anything else even if the model asks', async () => {
    const r = rig()
    r.turns.push([call('open_url', { url: 'https://x.example' }, '1'), { type: 'done', stop: 'tools' }], say('Report'))
    await r.runner.start(job)
    await settled(r)
    expect(r.requests[1].messages.at(-1)).toMatchObject({ role: 'tool', content: 'refused' })
    expect(r.requests[0].serverSearch).toBe(true)
  })

  it('extends the last request every time, so the cache holds', async () => {
    const r = rig()
    r.turns.push(search('1'), search('2', 'other'), say('Report'))
    await r.runner.start(job)
    await settled(r)
    for (let i = 1; i < r.requests.length; i++) {
      expect(r.requests[i].system).toBe(r.requests[0].system)
      expect(r.requests[i].messages.slice(0, r.requests[i - 1].messages.length)).toEqual(r.requests[i - 1].messages)
    }
  })

  it('runs one at a time, in order', async () => {
    const r = rig()
    await r.runner.start({ ...job, title: 'A' })
    await r.runner.start({ ...job, title: 'B' })
    await settled(r)
    expect((await r.store.list()).map((j) => j.status)).toEqual(['done', 'done'])
    expect(r.saved.map((t) => t.title)).toEqual(['A', 'B'])
  })

  it('turns away a sixth job waiting its turn', async () => {
    const store = new MemoryJobStore()
    for (let i = 0; i < LIMITS.queue; i++) await store.add({ id: String(i), title: 't', brief: 'b', status: 'queued', seedUrls: [], denied: [], language: 'en', rounds: 0, lookups: 0, workedMs: 0, partial: false, createdAt: i, updatedAt: i })
    expect(await rig(store).runner.start(job)).toContain('plenty waiting')
  })

  it('does nothing with web lookups off', async () => {
    const r = rig()
    ;(r.runner as unknown as { deps: { webOff(): boolean } }).deps.webOff = () => true
    await r.runner.start(job)
    expect(await settled(r)).toMatchObject({ status: 'paused' })
    expect(r.requests).toEqual([])
  })
})

describe('limits end in a partial report that says so', () => {
  it('runs out of lookups', async () => {
    const r = rig(undefined, { limits: { ...LIMITS, lookups: 2 } })
    r.turns.push(search('1', 'a'), search('2', 'b'), say('Partial report.'))
    await r.runner.start(job)
    expect(await settled(r)).toMatchObject({ status: 'done', partial: true })
    const last = r.requests.at(-1)!
    expect(last.toolsOff).toBe(true)
    expect(String(last.messages.at(-1)?.content)).toContain('only part of the answer')
  })

  it('stops a job going round in circles', async () => {
    const r = rig()
    r.turns.push(search('1'), search('2'), search('3'), say('Partial.'))
    await r.runner.start(job)
    expect(await settled(r)).toMatchObject({ status: 'done', partial: true })
    expect(r.requests).toHaveLength(4)
  })

  it('runs out of rounds', async () => {
    const r = rig(undefined, { limits: { ...LIMITS, rounds: 1 } })
    r.turns.push(search('1'), say('Partial.'))
    await r.runner.start(job)
    expect(await settled(r)).toMatchObject({ status: 'done', partial: true })
  })
})

describe('addresses', () => {
  const page = 'https://brief.example/x'

  it('waits about an address that’s only in the brief, because the brief is the model’s words', async () => {
    const r = rig()
    r.turns.push(read('1', page))
    await r.runner.start({ ...job, brief: `Read ${page}` })
    expect(await settled(r)).toMatchObject({ status: 'waiting', waitUrl: page })
    expect(r.news).toContain(true)
  })

  it('goes straight to a seeded address, and to a search result', async () => {
    const r = rig()
    r.turns.push(read('1', page), search('2'), read('3', 'https://found.example/a'), say('Report'))
    await r.runner.start({ ...job, seedUrls: [page] })
    expect(await settled(r)).toMatchObject({ status: 'done', lookups: 3 })
  })

  it('carries on after Allow, even with a new runner, as after a restart', async () => {
    const first = rig()
    first.turns.push(read('1', page))
    await first.runner.start(job)
    const waiting = await settled(first)

    const second = rig(first.store)
    await second.runner.answer(waiting.id, true)
    second.turns.push(say('Report'))
    expect(await settled(second)).toMatchObject({ status: 'done' })
    expect(second.requests[0].messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: '1', content: 'Result of read_page' })
  })

  it('tells the model after Don’t Allow, and goes on without it', async () => {
    const r = rig()
    r.turns.push(read('1', page))
    await r.runner.start(job)
    const waiting = await settled(r)
    r.turns.push(say('Report'))
    await r.runner.answer(waiting.id, false)
    expect(await settled(r)).toMatchObject({ status: 'done' })
    expect(r.requests.at(-1)!.messages.at(-1)).toMatchObject({ role: 'tool', content: 'declined' })
  })

  it('lets the next job run while one waits', async () => {
    const r = rig()
    r.turns.push(read('1', page), say('Second report'))
    await r.runner.start({ ...job, title: 'A' })
    await settled(r)
    await r.runner.start({ ...job, title: 'B' })
    await settled(r)
    expect((await r.store.list()).map((j) => j.status)).toEqual(['waiting', 'done'])
  })
})

describe('surviving', () => {
  it('resumes at every step after being killed, with no dangling call', async () => {
    const store = new MemoryJobStore()
    const first = rig(store)
    // Dies after the model asked for a tool, before the tool ran.
    first.turns.push(search('1'), () => {
      throw new Error('boom')
    })
    await first.runner.start(job)
    const dead = await settled(first)
    expect(dead.status).toBe('failed')

    const s2 = new MemoryJobStore()
    await s2.add({ ...dead, status: 'working', error: undefined, resultThread: undefined })
    await s2.appendStep(dead.id, 0, { role: 'user', content: 'Compare flights' })
    await s2.appendStep(dead.id, 1, { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'search_web', arguments: '{}' } }] })
    const second = rig(s2, { now: () => dead.updatedAt + 1000 })
    await second.runner.launch()
    expect(await settled(second)).toMatchObject({ status: 'done' })
    const roles = second.requests[0].messages.map((m) => m.role)
    expect(roles).toEqual(['user', 'assistant', 'tool'])
  })

  it('pauses a job left over a day at launch, and only Keep going starts it', async () => {
    const store = new MemoryJobStore()
    const r = rig(store, { now: () => 1 })
    await store.add({ id: 'a', title: 't', brief: 'b', status: 'working', seedUrls: [], denied: [], language: 'en', rounds: 1, lookups: 0, workedMs: 0, partial: false, createdAt: 0, updatedAt: 0 })
    const later = rig(store, { now: () => LIMITS.staleMs + 10 })
    await later.runner.launch()
    expect(await settled(later)).toMatchObject({ status: 'paused' })
    expect(later.requests).toEqual([])
    await later.runner.resume('a')
    expect(await settled(later)).toMatchObject({ status: 'done' })
    expect(r.requests).toEqual([])
  })

  it('sleeps without counting it as a failure, and carries on after waking', async () => {
    const r = rig()
    let release = () => {}
    const held = new Promise<void>((x) => (release = x))
    const provider = (r.runner as unknown as { deps: { provider(): Provider } }).deps
    const real = provider.provider()
    provider.provider = () => ({
      ...real,
      async *stream(req, signal) {
        if (r.requests.length === 0) {
          r.requests.push(req)
          await held
          throw Object.assign(new Error('x'), { name: 'AbortError' })
        }
        yield* real.stream(req, signal)
      }
    })
    await r.runner.start(job)
    await new Promise((x) => setImmediate(x))
    r.runner.suspend()
    release()
    expect(await settled(r)).toMatchObject({ status: 'working' })
    await r.runner.wake()
    expect(await settled(r)).toMatchObject({ status: 'done' })
  })

  it('tries again after a dropped connection, then pauses', async () => {
    const lost = () => {
      throw new ConnectionError('Otty can’t reach the internet.')
    }
    const r = rig()
    r.turns.push(lost, lost, say('Report'))
    await r.runner.start(job)
    expect(await settled(r)).toMatchObject({ status: 'done' })

    const q = rig()
    q.turns.push(lost, lost, lost, lost)
    await q.runner.start(job)
    expect(await settled(q)).toMatchObject({ status: 'paused' })
  })

  it('fails with friendly words, keeping what it found', async () => {
    const r = rig()
    r.turns.push([{ type: 'text', text: 'Found this much.' }, call('search_web', {}, '1'), { type: 'done', stop: 'tools' }], () => {
      throw new FriendlyError('Your balance is empty.')
    })
    await r.runner.start(job)
    expect(await settled(r)).toMatchObject({ status: 'failed', error: 'Your balance is empty.', partial: true })
    expect(r.saved[0].messages[1].text).toBe('Found this much.')
  })
})

describe('trying again', () => {
  it('carries on from the last saved step, and writes over the partial report', async () => {
    const r = rig()
    r.turns.push(search('1'), () => {
      throw new FriendlyError('Your balance is empty.')
    })
    await r.runner.start(job)
    const failed = await settled(r)
    expect(failed).toMatchObject({ status: 'failed' })
    expect((await r.runner.list())[0]).toMatchObject({ retry: true })

    r.turns.push(say('Full report'))
    await r.runner.retry(failed.id)
    const done = await settled(r)
    expect(done).toMatchObject({ status: 'done' })
    // The retry's request still holds the first search, so nothing was paid for twice.
    expect(r.requests.at(-1)!.messages.some((m) => m.role === 'tool')).toBe(true)
    expect(r.requests.filter((q) => q.messages.length === 1)).toHaveLength(1)
    expect(r.saved.at(-1)!.messages[1].text).toBe('Full report')
  })

  it('says so while it waits to reconnect, and clears the note once it’s through', async () => {
    const lost = () => {
      throw new ConnectionError('Otty can’t reach the internet.')
    }
    const r = rig()
    let seen: string | undefined
    r.turns.push(lost, () => {
      void r.store.list().then((j) => (seen = j[0].error))
      return say('Report') as never
    })
    await r.runner.start(job)
    const done = await settled(r)
    expect(seen).toBe('Lost the connection. Trying again…')
    expect(done).toMatchObject({ status: 'done' })
    expect(done.error).toBeUndefined()
  })

  it('treats a reply that goes quiet as a lost connection', async () => {
    const store = new MemoryJobStore()
    const hang: Provider = {
      async *stream(_req, signal) {
        await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' }))))
        yield { type: 'done', stop: 'end' } as ProviderEvent
      },
      complete: async () => ({ text: '' })
    }
    const runner = new JobRunner({
      store: () => store,
      provider: () => hang,
      tools: () => [],
      webOff: () => false,
      home: () => null,
      saveThread: async () => {},
      onChange: () => {},
      wait: async () => {},
      limits: { ...LIMITS, idleMs: 20, retryMs: [] }
    })
    await runner.start(job)
    await new Promise((x) => setTimeout(x, 150))
    expect((await store.list())[0]).toMatchObject({ status: 'paused' })
  })
})

describe('stopping and forgetting', () => {
  it('stops a job that’s waiting', async () => {
    const r = rig()
    r.turns.push(read('1', 'https://x.example/'))
    await r.runner.start(job)
    const waiting = await settled(r)
    await r.runner.stop(waiting.id)
    expect(await settled(r)).toMatchObject({ status: 'failed', error: 'You stopped this.' })
  })

  it('forgets the jobs of a deleted chat, from either end', async () => {
    const r = rig()
    await r.runner.start({ ...job, sourceThread: 'source' })
    const done = await settled(r)
    await r.runner.forgetChat(done.resultThread!)
    expect(await r.store.list()).toEqual([])
    await r.runner.start({ ...job, sourceThread: 'source' })
    await settled(r)
    await r.runner.forgetChat('source')
    expect(await r.store.list()).toEqual([])
  })

  it('forgets everything, stopping what’s running', async () => {
    const r = rig()
    r.turns.push(read('1', 'https://x.example/'))
    await r.runner.start(job)
    await settled(r)
    await r.runner.forgetAll()
    expect(await r.runner.list()).toEqual([])
  })

  it('writes nothing to disk with chats not remembered', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'otty-jobs-')), 'otty.db')
    const db = openDatabase(file)
    const r = rig(new MemoryJobStore())
    r.turns.push(search('1'), say('Report'))
    await r.runner.start(job)
    await settled(r)
    expect(db.prepare('select count(*) as n from jobs').get()).toEqual({ n: 0 })
    expect(db.prepare('select count(*) as n from job_steps').get()).toEqual({ n: 0 })
    db.close()
  })

  it('shows titles, states and counts, never histories', async () => {
    const r = rig()
    r.turns.push(search('1'), say('Secret report'))
    await r.runner.start(job)
    await settled(r)
    const items = await r.runner.list()
    expect(items[0]).toMatchObject({ kind: 'job', title: 'Flights', state: 'done', pages: 1, unseen: true })
    expect(JSON.stringify(items)).not.toContain('Secret report')
    await r.runner.markSeen()
    expect((await r.runner.list())[0].unseen).toBe(false)
  })
})

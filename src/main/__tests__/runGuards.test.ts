// D-41 and D-42: the Rule of Two inside a run, and a change made once per call even across a restart.
import { describe, expect, it, vi } from 'vitest'
import { CHAT_TOOLS, LASTING_TOOLS, SAFETY, type RunTaint } from '../toolSafety'
import type { ChatRequest, Message, Provider, ProviderEvent } from '../providers'

const { search, page } = vi.hoisted(() => ({ search: vi.fn(async () => 'Results'), page: vi.fn(async () => 'Page text') }))
vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {} }))
vi.mock('../settings', () => ({ getApiKey: () => 'sk-test', getStored: () => ({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' }) }))
vi.mock('../web', async (original) => ({ ...(await original<object>()), deepseekSearch: search, deepseekFetch: page }))
const { runTool } = await import('../tools')
const { runLoop } = await import('../loop')
const { openDatabase } = await import('../store/db')
const { SqliteJobStore } = await import('../jobs/stores')

const context = (taint: RunTaint, confirm = vi.fn(async () => false)) => ({ allowed: CHAT_TOOLS, taint, confirm, knownUrl: () => true })

describe('the Rule of Two in a chat turn (D-41)', () => {
  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true]
  ])('private %s, outside %s: a search asks first: %s', async (priv, outside, asks) => {
    search.mockClear()
    const confirm = vi.fn(async () => false)
    const out = await runTool('search_web', { query: 'Mei Ling room 4B' }, context({ private: priv, outside }, confirm))
    expect(confirm).toHaveBeenCalledTimes(asks ? 1 : 0)
    if (asks) {
      expect(confirm).toHaveBeenCalledWith('Look this up?', 'Mei Ling room 4B')
      expect(out.status).toBe('denied')
      expect(search).not.toHaveBeenCalled()
    } else expect(search).toHaveBeenCalled()
  })

  it('sends the query once the user says yes', async () => {
    search.mockClear()
    await runTool('search_web', { query: 'q' }, context({ private: true, outside: true }, vi.fn(async () => true)))
    expect(search).toHaveBeenCalledOnce()
  })

  function scripted(...turns: ProviderEvent[][]) {
    const requests: ChatRequest[] = []
    const provider: Provider = {
      async *stream(req) {
        requests.push(req)
        yield* turns.shift() ?? [{ type: 'done', stop: 'end' }]
      },
      complete: async () => ({ text: '' })
    }
    return { provider: () => provider, requests }
  }
  const read: ProviderEvent = { type: 'tool', call: { id: 'r1', type: 'function', function: { name: 'read_page', arguments: '{"url":"https://a.com"}' } } }

  it('marks a run outside once it reads a page, and Claude’s own search goes off when it also holds private data', async () => {
    for (const priv of [true, false]) {
      const { provider, requests } = scripted([read, { type: 'done', stop: 'tools' }])
      const taint = { private: priv, outside: false }
      await runLoop({ provider, system: 's', history: [], tools: () => [], context: context(taint), maxRounds: 3, signal: new AbortController().signal, onEvent: () => {} })
      expect(taint.outside).toBe(true)
      expect(requests.map((r) => r.serverSearch)).toEqual([true, !priv])
    }
  })
})

describe('the tool table is the only list (D-42)', () => {
  it('lists what can’t be undone from the table, and a link opened is one of them', () => {
    expect([...LASTING_TOOLS].sort()).toEqual(['copy_to_clipboard', 'create_reminder', 'open_url'])
    expect(SAFETY.open_url.changes).toBe('lasting')
  })

  it('offers a chat every tool in the table', () => {
    expect([...CHAT_TOOLS].sort()).toEqual(Object.keys(SAFETY).sort())
  })
})

describe('a change is made once per call, even after a restart (D-42)', () => {
  const remember = vi.fn(() => ({ result: 'Noted.', status: 'done' as const }))
  const unanswered: Message = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'remember', arguments: '{"text":"likes tea"}' } }] }

  it('refuses a resumed call that was already made, and anything that can change with no claims to check', async () => {
    const db = openDatabase(':memory:')
    const store = new SqliteJobStore(db)
    await store.add({ id: 'j1', title: 't', brief: 'b', status: 'working', seedUrls: [], denied: [], language: 'en', rounds: 0, lookups: 0, workedMs: 0, partial: false, createdAt: 1, updatedAt: 1 })
    const run = (claims = new SqliteJobStore(db)) => {
      const history: Message[] = [{ role: 'user', content: 'go' }, unanswered]
      return runLoop({
        provider: () => ({ async *stream() { yield { type: 'done', stop: 'end' } as const }, complete: async () => ({ text: '' }) }),
        system: 's',
        history,
        tools: () => [],
        context: { allowed: new Set(['remember']), confirm: async () => true, knownUrl: () => true, runId: 'j1', claims, learn: { remember, forget: remember } },
        maxRounds: 1,
        resume: true,
        signal: new AbortController().signal,
        onEvent: () => {}
      }).then(() => history.find((m) => m.role === 'tool')?.content)
    }

    expect(await run()).toBe('Noted.')
    // The result was lost before it was saved, so the call reruns on resume: a new store on the same file says no.
    expect(await run()).toMatch(/already done once/)
    expect(remember).toHaveBeenCalledOnce()

    const noClaims = await runTool('remember', {}, { allowed: new Set(['remember']), confirm: async () => true, knownUrl: () => true, runId: 'j1', learn: { remember, forget: remember } })
    expect(noClaims.status).toBe('denied')
  })
})

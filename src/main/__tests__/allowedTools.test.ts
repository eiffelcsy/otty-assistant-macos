import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message, Provider, ProviderEvent, ChatRequest } from '../providers'

let baseUrl = 'https://api.deepseek.com'

vi.mock('electron', () => ({ clipboard: { writeText: vi.fn() }, shell: { openExternal: vi.fn() }, ClipboardItem: class {} }))
vi.mock('../settings', () => ({ getApiKey: () => 'key', getStored: () => ({ baseUrl, model: 'm' }) }))
const { shell } = await import('electron')
const { runTool, toolDefs } = await import('../tools')
const { runLoop } = await import('../loop')

const allowed = new Set(['search_web', 'read_page'])
const ctx = { confirm: async () => true, knownUrl: () => true, allowed }

beforeEach(() => {
  baseUrl = 'https://api.deepseek.com'
  vi.mocked(shell.openExternal).mockClear()
})

describe('allowed tools', () => {
  it('refuses a tool the model calls without being offered it, before anything happens', async () => {
    const confirm = vi.fn(async () => true)
    expect(await runTool('open_url', { url: 'https://example.com' }, { ...ctx, confirm })).toMatchObject({ status: 'error' })
    expect(confirm).not.toHaveBeenCalled()
    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  it('offers only what’s allowed', () => {
    expect(toolDefs(allowed).map((t) => t.function.name)).toEqual(['search_web', 'read_page'])
    expect(toolDefs().map((t) => t.function.name)).toContain('open_url')
  })

  it('still refuses the web with web lookups off, even when allowed', async () => {
    baseUrl = 'http://localhost:11434/v1'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(toolDefs(allowed)).toEqual([])
    expect(await runTool('search_web', { query: 'private words' }, ctx)).toMatchObject({ status: 'error' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('the tool loop', () => {
  /** Replies with each list of events in turn, and keeps what it was asked. */
  function scripted(...turns: ProviderEvent[][]) {
    const requests: ChatRequest[] = []
    const provider: Provider = {
      async *stream(req) {
        requests.push({ ...req, messages: [...req.messages] })
        yield* turns.shift() ?? [{ type: 'done', stop: 'end' }]
      },
      complete: async () => ({ text: '' })
    }
    return { provider: () => provider, requests }
  }
  const call = (name: string, args: object): ProviderEvent => ({ type: 'tool', call: { id: `id-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } } })
  const options = (history: Message[], provider: () => Provider) => ({
    provider,
    system: 's',
    history,
    tools: () => [],
    context: { confirm: async () => true, knownUrl: () => true },
    maxRounds: 2,
    signal: new AbortController().signal,
    onEvent: () => {}
  })

  it('turns Claude’s own search off unless search is allowed', async () => {
    const first = scripted([{ type: 'done', stop: 'end' }])
    await runLoop({ ...options([], first.provider), context: { ...ctx, allowed: new Set(['read_page']) } })
    expect(first.requests[0].serverSearch).toBe(false)
    const second = scripted([{ type: 'done', stop: 'end' }])
    await runLoop(options([], second.provider))
    expect(second.requests[0].serverSearch).toBe(true)
  })

  it('reports every message it adds, and answers with tools off once the rounds run out', async () => {
    const { provider, requests } = scripted(
      [call('nope', {}), { type: 'done', stop: 'tools' }],
      [call('nope', {}), { type: 'done', stop: 'tools' }],
      [{ type: 'text', text: 'Done' }, { type: 'done', stop: 'end' }]
    )
    const history: Message[] = []
    const added: string[] = []
    await runLoop({ ...options(history, provider), onMessage: (m) => added.push(m.role) })
    expect(added).toEqual(['assistant', 'tool', 'assistant', 'tool', 'assistant'])
    expect(history).toHaveLength(5)
    expect(requests.map((r) => r.toolsOff)).toEqual([false, false, true])
  })
})

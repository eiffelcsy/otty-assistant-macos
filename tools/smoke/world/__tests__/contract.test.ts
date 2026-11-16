// The world's contract (D-47): the real provider adapters, run against the fake world's streams, must see what a real
// service would send them. A fake that drifts from the wire format fails here before any smoke spec does.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { anthropicProvider } from '../../../../src/main/providers/anthropic'
import { FriendlyError } from '../../../../src/main/providers/errors'
import { openAiProvider } from '../../../../src/main/providers/openai'
import { profileFor } from '../../../../src/main/providers/profiles'
import type { ChatRequest, Provider, ProviderEvent } from '../../../../src/main/providers/types'
import { World } from '../server'

vi.mock('electron', () => ({ app: { isPackaged: true } }))

const world = new World()
let base = ''

beforeAll(async () => {
  base = await world.start()
})
afterAll(() => world.stop())
beforeEach(() => world.reset())

// The world takes `/<host><path>` when no smoke build sits in front of it.
const deepseek = () =>
  openAiProvider(() => ({ baseUrl: `${base}/api.deepseek.com`, model: 'deepseek-flash', thinking: false, key: 'sk-contract', profile: profileFor('https://api.deepseek.com') }))
const claude = (model = 'claude-sonnet-5-5') =>
  anthropicProvider(() => ({ baseUrl: `${base}/api.anthropic.com`, model, thinking: false, key: 'sk-ant-contract', profile: profileFor('https://api.anthropic.com') }))

const ask = (text: string, extra: Partial<ChatRequest> = {}): ChatRequest => ({ messages: [{ role: 'user', content: text }], ...extra })

async function collect(p: Provider, req: ChatRequest): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = []
  for await (const e of p.stream(req, new AbortController().signal)) events.push(e)
  return events
}

/** Text events joined, and every other event as it came. */
function summary(events: ProviderEvent[]) {
  const text = events.flatMap((e) => (e.type === 'text' ? [e.text] : [])).join('')
  return { text, rest: events.filter((e) => e.type !== 'text') }
}

const answer = { think: 'Let me add.', say: 'One plus one is two, so the answer is 2.', calls: [{ name: 'calculate', args: { steps: ['1 + 1'] } }], usage: { input: 50, output: 7, cached: 30 } }

describe('the world speaks OpenAI’s chat completions', () => {
  it('streams reasoning, text in pieces, whole tool calls, usage and why it stopped', async () => {
    world.reply('Add these', answer)
    const events = await collect(deepseek(), ask('Add these'))
    expect(events.filter((e) => e.type === 'text').length).toBeGreaterThan(1)
    expect(summary(events)).toEqual({
      text: answer.say,
      rest: [
        { type: 'reasoning', text: 'Let me add.' },
        { type: 'tool', call: { id: expect.stringMatching(/^call_/), type: 'function', function: { name: 'calculate', arguments: '{"steps":["1 + 1"]}' } } },
        { type: 'done', stop: 'tools', usage: { input: 50, output: 7, cached: 30 } }
      ]
    })
    expect(world.requests[0]).toMatchObject({ url: 'https://api.deepseek.com/chat/completions', authorization: 'Bearer sk-contract' })
    expect(world.turnRequests('openai')).toHaveLength(1)
  })

  it('answers a request that isn’t streamed', async () => {
    world.reply('Title this', { say: 'Otters', usage: { input: 9, output: 1 } })
    expect(await deepseek().complete(ask('Title this'))).toEqual({ text: 'Otters', model: 'deepseek-flash', usage: { input: 9, output: 1 } })
  })

  it('gives background calls the background reply', async () => {
    world.backgroundReply = 'A chat about otters'
    expect((await deepseek().complete(ask('anything'))).text).toBe('A chat about otters')
  })

  it('maps a scripted stop', async () => {
    world.reply('Long', { say: 'Cut', stop: 'length' })
    expect((await collect(deepseek(), ask('Long'))).at(-1)).toMatchObject({ type: 'done', stop: 'length' })
  })

  it('fails with a scripted status the way the service would', async () => {
    world.reply('Hi', { status: 401 })
    await expect(collect(deepseek(), ask('Hi'))).rejects.toThrow(/key doesn’t look right/)
  })

  it('refuses an unscripted turn loudly', async () => {
    await expect(collect(deepseek(), ask('Nobody wrote this'))).rejects.toBeInstanceOf(FriendlyError)
    expect(world.unscripted).toEqual(['no reply scripted for: Nobody wrote this'])
  })
})

describe('the world speaks Anthropic’s messages', () => {
  it('streams text in pieces, whole tool calls, usage, why it stopped and a replay with the signed thinking', async () => {
    world.reply('Add these', answer)
    const events = await collect(claude(), ask('Add these'))
    expect(events.filter((e) => e.type === 'text').length).toBeGreaterThan(1)
    const { text, rest } = summary(events)
    expect(text).toBe(answer.say)
    expect(rest).toEqual([
      { type: 'tool', call: { id: expect.stringMatching(/^toolu_/), type: 'function', function: { name: 'calculate', arguments: '{"steps":["1 + 1"]}' } } },
      {
        type: 'done',
        stop: 'tools',
        usage: { input: 50, output: 7, cached: 30 },
        replay: {
          id: expect.any(String),
          model: 'claude-sonnet-5-5',
          blocks: [
            { type: 'thinking', thinking: 'Let me add.', signature: expect.stringMatching(/^smoke-sig-/) },
            { type: 'text', text: answer.say },
            { type: 'tool_use', id: expect.stringMatching(/^toolu_/), name: 'calculate', input: { steps: ['1 + 1'] } }
          ]
        }
      }
    ])
    expect(world.requests[0]).toMatchObject({ url: expect.stringMatching(/^https:\/\/api\.anthropic\.com\/v1\/messages/), authorization: 'Bearer sk-ant-contract' })
    expect(world.turnRequests('anthropic')).toHaveLength(1)
  })

  it('reports Claude’s own searches, and keeps their results in the replay', async () => {
    const results = [{ title: 'macOS news', url: 'https://www.apple.com/newsroom/macos', age: 'November 10, 2026' }]
    world.reply('What’s new', { searches: [{ query: 'macOS news', results }], say: 'See [Apple](https://www.apple.com/newsroom/macos).' })
    const events = await collect(claude(), ask('What’s new', { serverSearch: true }))
    expect(events.filter((e) => e.type === 'search')).toEqual([
      { type: 'search', status: 'running' },
      { type: 'search', status: 'done' }
    ])
    const done = events.at(-1) as Extract<ProviderEvent, { type: 'done' }>
    expect(done.stop).toBe('end')
    expect(done.replay?.blocks).toContainEqual(expect.objectContaining({ type: 'web_search_tool_result', content: [expect.objectContaining({ url: results[0].url })] }))
    expect(world.modelRequests('anthropic')[0].tools).toContainEqual(expect.objectContaining({ name: 'web_search', type: expect.stringMatching(/^web_search_/) }))
  })

  it('matches a tool round by the question, though its last user message only holds results', async () => {
    world.reply('Add these', { say: 'It’s 2.' })
    const req: ChatRequest = {
      messages: [
        { role: 'user', content: 'Add these' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'toolu_1', type: 'function', function: { name: 'calculate', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'toolu_1', content: '2' }
      ]
    }
    expect(summary(await collect(claude(), req)).text).toBe('It’s 2.')
  })

  it('answers a request that isn’t streamed', async () => {
    world.reply('Title this', { say: 'Otters', usage: { input: 9, output: 1 } })
    expect(await claude().complete(ask('Title this'))).toEqual({ text: 'Otters', model: 'claude-sonnet-5-5', usage: { input: 9, output: 1 } })
  })

  it('maps a scripted refusal', async () => {
    world.reply('Bad', { stop: 'refusal' })
    expect((await collect(claude(), ask('Bad'))).at(-1)).toMatchObject({ type: 'done', stop: 'refusal' })
  })

  it('fails with a scripted status once, without the SDK retrying', async () => {
    world.reply('Hi', { status: 429 })
    await expect(collect(claude(), ask('Hi'))).rejects.toThrow(/lots of questions/)
    expect(world.requests).toHaveLength(1)
  })

  it('refuses an unscripted turn loudly, once', async () => {
    await expect(collect(claude(), ask('Nobody wrote this'))).rejects.toBeInstanceOf(FriendlyError)
    expect(world.unscripted).toEqual(['no reply scripted for: Nobody wrote this'])
  })
})

describe('the world’s search shapes', () => {
  const post = (path: string, body: object) =>
    fetch(`${base}/api.deepseek.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('answers DeepSeek’s search and reader the way web.ts reads them', async () => {
    const { deepseekFetch, deepseekSearch } = await import('../../../../src/main/web')
    world.search('macos', [{ title: 'macOS 27.1 is out', url: 'https://www.apple.com/newsroom/macos', summary: 'What’s new.', date: '2026-11-10T09:00:00Z' }])
    world.read('https://www.apple.com/newsroom/macos', { title: 'macOS 27.1', content: 'Faster otters.' })
    const via = ((url: string, init: RequestInit) => fetch(url.replace('https://', `${base}/`), init)) as typeof fetch
    const cfg = { baseUrl: 'https://api.deepseek.com', key: 'sk-contract' }
    expect(await deepseekSearch(cfg, 'What’s new in macOS', via)).toBe('[1] macOS 27.1 is out (www.apple.com, 2026-11-10)\nhttps://www.apple.com/newsroom/macos\nWhat’s new.')
    expect(await deepseekFetch(cfg, 'https://www.apple.com/newsroom/macos', via)).toBe('# macOS 27.1\nSource: https://www.apple.com/newsroom/macos\n\nFaster otters.')
  })

  it('fails a search with a scripted status, and an unscripted one loudly', async () => {
    world.search('busy', { status: 402 })
    expect((await post('/v1/tools/search', { query: 'busy day' })).status).toBe(402)
    expect((await post('/v1/tools/search', { query: 'nothing' })).status).toBe(500)
    expect(world.unscripted).toEqual(['no search scripted for: nothing'])
  })

  it('answers DuckDuckGo and Wikipedia in the shapes the keyless lookup reads', async () => {
    world.lookup('Ada', { abstract: { text: 'Ada Lovelace was a mathematician.', url: 'https://duckduckgo.com/Ada_Lovelace' }, wiki: [{ title: 'Ada Lovelace', extract: 'English mathematician.' }] })
    const get = (url: string) => fetch(url.replace('https://', `${base}/`)).then((r) => r.json())
    const ddg = await get('https://api.duckduckgo.com/?q=Ada%20Lovelace&format=json&no_html=1&skip_disambig=1')
    expect(ddg).toMatchObject({ AbstractText: 'Ada Lovelace was a mathematician.', AbstractURL: 'https://duckduckgo.com/Ada_Lovelace' })
    const search = await get('https://en.wikipedia.org/w/rest.php/v1/search/page?q=Ada%20Lovelace&limit=3')
    expect(search.pages).toEqual([expect.objectContaining({ key: 'Ada_Lovelace', title: 'Ada Lovelace' })])
    const page = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(search.pages[0].key)}`)
    expect(page).toEqual({ title: 'Ada Lovelace', extract: 'English mathematician.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Ada_Lovelace' } } })
    expect(world.unscripted).toEqual([])
  })
})

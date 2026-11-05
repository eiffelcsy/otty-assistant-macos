import { describe, expect, it, vi } from 'vitest'
import { openAiProvider } from '../openai'
import { profileFor } from '../profiles'
import type { ChatRequest, ProviderEvent } from '../types'

vi.mock('electron', () => ({ app: { isPackaged: true } }))

const config = { baseUrl: 'https://api.deepseek.com', model: 'm', thinking: false, key: 'k', profile: profileFor('https://api.deepseek.com') }
const provider = openAiProvider(() => config)
const providerFor = (baseUrl: string, key = '') => openAiProvider(() => ({ ...config, baseUrl, key, profile: profileFor(baseUrl) }))
const sse = (...chunks: object[]) => new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join(''))

async function collect(req: ChatRequest = { messages: [] }): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = []
  for await (const e of provider.stream(req, new AbortController().signal)) events.push(e)
  return events
}

describe('openAiProvider', () => {
  it('reports thinking, text, then whole tool calls, then why it stopped', async () => {
    const call = { index: 0, id: 'a', function: { name: 'f', arguments: '{}' } }
    vi.stubGlobal('fetch', async () =>
      sse(
        { choices: [{ delta: { reasoning_content: 'Hmm' } }] },
        { choices: [{ delta: { content: 'Hi' } }] },
        { choices: [{ delta: { tool_calls: [call] }, finish_reason: 'tool_calls' }] }
      )
    )
    expect(await collect()).toEqual([
      { type: 'reasoning', text: 'Hmm' },
      { type: 'text', text: 'Hi' },
      { type: 'tool', call: { id: 'a', type: 'function', function: { name: 'f', arguments: '{}' } } },
      { type: 'done', stop: 'tools' }
    ])
  })

  it.each([
    ['stop', 'end'],
    ['length', 'length'],
    ['content_filter', 'refusal'],
    ['something_new', 'end']
  ])('maps a finish reason of %s to %s', async (reason, stop) => {
    vi.stubGlobal('fetch', async () => sse({ choices: [{ delta: {}, finish_reason: reason }] }))
    expect((await collect()).at(-1)).toEqual({ type: 'done', stop })
  })

  it('still finishes when a stream ends with no finish reason', async () => {
    vi.stubGlobal('fetch', async () => sse({ choices: [{ delta: { content: 'Hi' } }] }))
    expect((await collect()).at(-1)).toEqual({ type: 'done', stop: 'end' })
  })

  it('skips noise in a stream', async () => {
    vi.stubGlobal('fetch', async () => new Response(`: ping\n\ndata: not json\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: 'Hi' } }] })}\n\ndata: [DONE]\n\n`))
    expect((await collect())[0]).toEqual({ type: 'text', text: 'Hi' })
  })

  it('lets a request ask for more or less thinking than the setting', async () => {
    const sent: { thinking: { type: string } }[] = []
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)))
      return Response.json({ choices: [] })
    })
    await provider.complete({ messages: [] })
    await provider.complete({ messages: [], reasoning: 'deep' })
    await provider.complete({ messages: [], reasoning: 'least' })
    expect(sent.map((b) => b.thinking.type)).toEqual(['disabled', 'enabled', 'disabled'])
  })

  it('returns the trimmed text and the model', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ model: 'x', choices: [{ message: { content: ' Hi ' } }] }))
    expect(await provider.complete({ messages: [] })).toEqual({ text: 'Hi', model: 'x' })
  })

  it('only sends the thinking field to a service that has one', async () => {
    let body = {}
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return Response.json({ choices: [] })
    })
    await providerFor('https://api.openai.com/v1', 'k').complete({ messages: [] })
    expect(body).not.toHaveProperty('thinking')
    await providerFor('https://api.deepseek.com', 'k').complete({ messages: [] })
    expect(body).toHaveProperty('thinking')
  })

  it('names the token limit the way each service wants it', async () => {
    let body = {}
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return Response.json({ choices: [] })
    })
    await providerFor('https://api.openai.com/v1', 'k').complete({ messages: [], maxTokens: 9 })
    expect(body).toMatchObject({ max_completion_tokens: 9 })
    expect(body).not.toHaveProperty('max_tokens')
    await providerFor('http://localhost:11434/v1').complete({ messages: [], maxTokens: 9 })
    expect(body).toMatchObject({ max_tokens: 9 })
  })

  it('sends no Authorization header without a key', async () => {
    let headers = {}
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      headers = init.headers as object
      return Response.json({ choices: [] })
    })
    await providerFor('http://localhost:11434/v1').complete({ messages: [] })
    expect(headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('tries again without tools for a model that can’t use them', async () => {
    const sent: object[] = []
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      sent.push(body)
      if (body.tools) return new Response('registry.ollama.ai/library/gemma does not support tools', { status: 400 })
      return sse({ choices: [{ delta: { content: 'Hi' } }] })
    })
    const events: ProviderEvent[] = []
    for await (const e of providerFor('http://localhost:11434/v1').stream({ messages: [], tools: [{}] }, new AbortController().signal)) events.push(e)
    expect(sent).toHaveLength(2)
    expect(sent[1]).not.toHaveProperty('tools')
    expect(events[0]).toEqual({ type: 'text', text: 'Hi' })
  })

  it('explains the usual local problems in plain words', async () => {
    const local = providerFor('http://localhost:11434/v1')
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(local.complete({ messages: [] })).rejects.toThrow('Check that Ollama or LM Studio is running')
    vi.stubGlobal('fetch', async () => new Response('model not found', { status: 404 }))
    await expect(local.complete({ messages: [] })).rejects.toThrow('downloaded in Ollama or LM Studio')
  })

  it('keeps DeepSeek’s top-up wording and names other services', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 402 }))
    await expect(provider.complete({ messages: [] })).rejects.toThrow('Your DeepSeek balance is empty. Top up at platform.deepseek.com, then try again.')
    await expect(providerFor('https://api.openai.com/v1', 'k').complete({ messages: [] })).rejects.toThrow('Your OpenAI balance is empty. Top up at platform.openai.com')
    await expect(providerFor('https://x.example/v1', 'k').complete({ messages: [] })).rejects.toThrow('balance is empty.')
  })
})

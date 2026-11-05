import { describe, expect, it, vi } from 'vitest'
import { openAiProvider } from '../openai'
import type { ChatRequest, ProviderEvent } from '../types'

vi.mock('electron', () => ({ app: { isPackaged: true } }))

const config = { baseUrl: 'https://api.test', model: 'm', thinking: false, key: 'k' }
const provider = openAiProvider(() => config)
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
})

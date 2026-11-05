import { beforeEach, describe, expect, it, vi } from 'vitest'
import { anthropicProvider, toAnthropicMessages } from '../anthropic'
import { profileFor } from '../profiles'
import type { ChatRequest, Message, ProviderEvent } from '../types'

const profile = profileFor('https://api.anthropic.com')
const config = { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', thinking: false, key: 'sk-test', profile }
const provider = anthropicProvider(() => config)

const HOST = 'api.anthropic.com'
const usage = { input_tokens: 1, output_tokens: 1 }
const thinkingBlock = { type: 'thinking', thinking: '', signature: 'sig-1' }

/** The events the API sends for a reply made of these blocks. */
function sse(blocks: Record<string, unknown>[], stopReason = 'end_turn'): Response {
  const events: object[] = [{ type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, usage } }]
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })
    } else if (block.type === 'tool_use') {
      events.push({ type: 'content_block_start', index, content_block: { ...block, input: {} } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
    } else {
      events.push({ type: 'content_block_start', index, content_block: { ...block, signature: '' } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: block.signature } })
    }
    events.push({ type: 'content_block_stop', index })
  })
  events.push({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 1 } })
  events.push({ type: 'message_stop' })
  const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

const apiError = (status: number, message: string, type = 'invalid_request_error') =>
  new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'retry-after-ms': '0' }
  })

async function collect(req: ChatRequest = { messages: [{ role: 'user', content: 'Hi' }] }, signal = new AbortController().signal) {
  const events: ProviderEvent[] = []
  for await (const e of provider.stream(req, signal)) events.push(e)
  return events
}

let sent: { url: string; headers: Headers; body: Record<string, any> }[] = []

function answerWith(reply: () => Response) {
  vi.stubGlobal('fetch', async (url: string | URL, init: RequestInit) => {
    sent.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) })
    return reply()
  })
}

beforeEach(() => {
  sent = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the request', () => {
  it('asks for Claude with caching, low effort and thinking that can be dropped', async () => {
    answerWith(() => sse([{ type: 'text', text: 'Hi' }]))
    await collect({ system: 'Be kind.', messages: [{ role: 'user', content: 'Hi' }] })
    const { url, headers, body } = sent[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(headers.get('authorization')).toBe('Bearer sk-test')
    expect(headers.get('anthropic-beta')).toContain('thinking-binding-controls-2026-08-01')
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(body).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: 'Be kind.',
      stream: true,
      max_tokens: 64_000,
      cache_control: { type: 'ephemeral' },
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort: 'low' },
      fallbacks: 'default'
    })
  })

  it('never sends a thinking mode Sonnet 5.5 rejects', async () => {
    answerWith(() => sse([{ type: 'text', text: 'Hi' }]))
    await collect()
    expect(sent[0].body.thinking.type).not.toBe('disabled')
    expect(sent[0].body.thinking).not.toHaveProperty('budget_tokens')
    expect(sent[0].body).not.toHaveProperty('temperature')
  })

  it('follows the thinking setting and a request’s own level', async () => {
    answerWith(() => sse([{ type: 'text', text: 'Hi' }]))
    const thinks = anthropicProvider(() => ({ ...config, thinking: true }))
    for await (const _ of thinks.stream({ messages: [] }, new AbortController().signal));
    await collect({ messages: [], reasoning: 'deep' })
    expect(sent.map((s) => s.body.output_config.effort)).toEqual(['medium', 'high'])
  })

  it('only asks for fallbacks on models that take them', async () => {
    answerWith(() => sse([{ type: 'text', text: 'Hi' }]))
    const haiku = anthropicProvider(() => ({ ...config, model: 'claude-haiku-5-5' }))
    for await (const _ of haiku.stream({ messages: [] }, new AbortController().signal));
    expect(sent[0].body).not.toHaveProperty('fallbacks')
    expect(sent[0].headers.get('anthropic-beta')).not.toContain('server-side-fallback')
  })

  it('translates tools, and keeps them listed when they’re off', async () => {
    answerWith(() => sse([{ type: 'text', text: 'Hi' }]))
    const tools = [{ type: 'function', function: { name: 'find', description: 'Finds', parameters: { type: 'object', properties: {} } } }]
    await collect({ messages: [], tools })
    await collect({ messages: [], tools, toolsOff: true })
    expect(sent[0].body.tools).toEqual([{ name: 'find', description: 'Finds', input_schema: { type: 'object', properties: {} } }])
    expect(sent[0].body).not.toHaveProperty('tool_choice')
    expect(sent[1].body.tools).toEqual(sent[0].body.tools)
    expect(sent[1].body.tool_choice).toEqual({ type: 'none' })
  })

  it('copes with an address that ends in /v1', async () => {
    answerWith(() => sse([{ type: 'text', text: 'Hi' }]))
    const v1 = anthropicProvider(() => ({ ...config, baseUrl: 'https://api.anthropic.com/v1/' }))
    for await (const _ of v1.stream({ messages: [] }, new AbortController().signal));
    expect(sent[0].url).toBe('https://api.anthropic.com/v1/messages')
  })
})

describe('the reply', () => {
  it('streams text and keeps the whole reply for sending back', async () => {
    const blocks = [thinkingBlock, { type: 'text', text: 'Hello' }]
    answerWith(() => sse(blocks))
    const events = await collect()
    expect(events[0]).toEqual({ type: 'text', text: 'Hello' })
    expect(events.at(-1)).toMatchObject({ type: 'done', stop: 'end', replay: { id: HOST, model: 'claude-sonnet-5-5' } })
    const done = events.at(-1) as Extract<ProviderEvent, { type: 'done' }>
    expect(done.replay?.blocks[0]).toMatchObject({ type: 'thinking', signature: 'sig-1' })
  })

  it('turns tool use into a whole tool call', async () => {
    answerWith(() => sse([{ type: 'tool_use', id: 'toolu_1', name: 'find', input: { q: 'otters' } }], 'tool_use'))
    const events = await collect()
    expect(events[0]).toEqual({ type: 'tool', call: { id: 'toolu_1', type: 'function', function: { name: 'find', arguments: '{"q":"otters"}' } } })
    expect(events[1]).toMatchObject({ type: 'done', stop: 'tools' })
  })

  it.each([
    ['refusal', 'refusal'],
    ['max_tokens', 'length'],
    ['something_new', 'end']
  ])('maps a stop reason of %s to %s', async (reason, stop) => {
    answerWith(() => sse([{ type: 'text', text: 'Hi' }], reason))
    expect((await collect()).at(-1)).toMatchObject({ type: 'done', stop })
  })
})

describe('toClaudeMessages', () => {
  it('turns a picture into a base64 image', () => {
    const [m] = toAnthropicMessages([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }, { type: 'text', text: 'What?' }] }], HOST)
    expect(m.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      { type: 'text', text: 'What?' }
    ])
  })

  it('puts all the results of one reply in a single message', () => {
    const out = toAnthropicMessages([
      { role: 'user', content: 'Go' },
      { role: 'assistant', content: null, tool_calls: [call('a'), call('b')] },
      { role: 'tool', tool_call_id: 'a', content: 'one' },
      { role: 'tool', tool_call_id: 'b', content: 'two' },
      { role: 'user', content: 'Thanks' }
    ], HOST)
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'user'])
    expect(out[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 'a', content: 'one' },
      { type: 'tool_result', tool_use_id: 'b', content: 'two' }
    ])
  })

  it('sends Claude’s own reply back exactly', () => {
    const blocks = [thinkingBlock, { type: 'text', text: 'Hi' }]
    const [m] = toAnthropicMessages([{ role: 'assistant', content: 'Hi', provider: { id: HOST, model: 'x', blocks } }], HOST)
    expect(m.content).toBe(blocks)
  })

  it('rebuilds a reply from another service, and cleans its tool ids', () => {
    const out = toAnthropicMessages([
      { role: 'assistant', content: 'Let me look', tool_calls: [call('call:1/x')], provider: { id: 'other', model: 'x', blocks: [{ bad: true }] } },
      { role: 'tool', tool_call_id: 'call:1/x', content: 'found' }
    ], HOST)
    expect(out[0].content).toEqual([
      { type: 'text', text: 'Let me look' },
      { type: 'tool_use', id: 'call_1_x', name: 'find', input: { q: 'x' } }
    ])
    expect(out[1].content).toEqual([{ type: 'tool_result', tool_use_id: 'call_1_x', content: 'found' }])
  })

  it('survives bad tool arguments and an empty reply', () => {
    const bad = { ...call('a'), function: { name: 'find', arguments: '{oops' } }
    const out = toAnthropicMessages([{ role: 'assistant', content: null, tool_calls: [bad] }, { role: 'assistant', content: null }], HOST)
    expect(out[0].content).toEqual([{ type: 'tool_use', id: 'a', name: 'find', input: {} }])
    expect(out[1].content).toEqual([{ type: 'text', text: '(No reply.)' }])
  })
})

function call(id: string): Extract<Message, { role: 'assistant' }>['tool_calls'] extends (infer T)[] | undefined ? T : never {
  return { id, type: 'function', function: { name: 'find', arguments: '{"q":"x"}' } }
}

describe('complete', () => {
  it('leaves room for thinking under a small limit, and returns the text', async () => {
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) })
      return Response.json({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [thinkingBlock, { type: 'text', text: ' Hi ' }], stop_reason: 'end_turn', usage })
    })
    expect(await provider.complete({ messages: [{ role: 'user', content: 'Hi' }], maxTokens: 20 })).toEqual({ text: 'Hi', model: 'claude-sonnet-5-5' })
    expect(sent[0].body.max_tokens).toBe(2_000)
  })
})

describe('when things go wrong', () => {
  it.each([
    [401, 'bad key', 'authentication_error', 'key doesn’t look right'],
    [402, 'pay up', 'billing_error', 'Your Claude balance is empty. Top up at platform.claude.com'],
    [400, 'Your credit balance is too low', 'invalid_request_error', 'balance is empty'],
    [404, 'no such model', 'not_found_error', 'can’t find that model'],
    [429, 'slow down', 'rate_limit_error', 'lots of questions'],
    [529, 'overloaded', 'overloaded_error', 'having a moment'],
    [400, 'prompt is too long: 2000000 tokens', 'invalid_request_error', 'grown too long'],
    [400, 'Could not process image', 'invalid_request_error', 'can’t look at pictures'],
    [418, 'odd', 'invalid_request_error', 'error 418']
  ])('turns a %i (%s) into a friendly message', async (status, message, type, words) => {
    answerWith(() => apiError(status, message, type))
    await expect(collect()).rejects.toThrow(words)
    await expect(provider.complete({ messages: [] })).rejects.toThrow(words)
  })

  it('explains a lost connection', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(collect()).rejects.toThrow('can’t reach the internet')
  }, 15_000)

  it('stops quietly when the user presses Stop', async () => {
    const abort = new AbortController()
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) =>
      new Response(
        new ReadableStream({
          start(controller) {
            const first = { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'm', content: [], stop_reason: null, usage } }
            controller.enqueue(new TextEncoder().encode(`event: message_start\ndata: ${JSON.stringify(first)}\n\n`))
            init.signal?.addEventListener('abort', () => controller.error(new DOMException('Stopped', 'AbortError')))
          }
        }),
        { headers: { 'content-type': 'text/event-stream' } }
      )
    )
    const run = collect({ messages: [] }, abort.signal)
    setTimeout(() => abort.abort(), 20)
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('another server that speaks this format', () => {
  const custom = (baseUrl: string, key: string) =>
    anthropicProvider(() => ({ baseUrl, model: 'their-model', thinking: true, key, profile: profileFor(baseUrl, 'anthropic') }))
  const run = async (p: ReturnType<typeof custom>, req: ChatRequest = { messages: [] }) => {
    const events: ProviderEvent[] = []
    for await (const e of p.stream(req, new AbortController().signal)) events.push(e)
    return events
  }

  it('gets a plain request, with none of Claude’s extras', async () => {
    answerWith(() => sse([{ type: 'text', text: 'Hi' }]))
    await run(custom('https://models.example.com/anthropic', 'k'))
    const { url, headers, body } = sent[0]
    expect(url).toBe('https://models.example.com/anthropic/v1/messages')
    expect(headers.get('anthropic-beta')).toBeNull()
    for (const field of ['thinking', 'output_config', 'cache_control', 'fallbacks']) expect(body).not.toHaveProperty(field)
    expect(body).toMatchObject({ model: 'their-model', max_tokens: 64_000, stream: true })
  })

  it('sends the key both ways, because servers differ', async () => {
    answerWith(() => sse([{ type: 'text', text: 'Hi' }]))
    await run(custom('https://models.example.com', 'k'))
    expect(sent[0].headers.get('x-api-key')).toBe('k')
    expect(sent[0].headers.get('authorization')).toBe('Bearer k')
  })

  it('works with no key, and never finds one elsewhere', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'from-the-environment')
    answerWith(() => sse([{ type: 'text', text: 'Hi' }]))
    await run(custom('http://localhost:8080', ''))
    expect(sent[0].headers.get('x-api-key')).toBeNull()
    expect(sent[0].headers.get('authorization') ?? '').not.toContain('from-the-environment')
    vi.unstubAllEnvs()
  })

  it('stamps replies with the server, so thinking isn’t sent to another one', async () => {
    answerWith(() => sse([thinkingBlock, { type: 'text', text: 'Hi' }]))
    const events = await run(custom('https://models.example.com/anthropic', 'k'))
    const { replay } = events.at(-1) as Extract<ProviderEvent, { type: 'done' }>
    expect(replay?.id).toBe('models.example.com')
    const message: Message = { role: 'assistant', content: 'Hi', provider: replay }
    expect(toAnthropicMessages([message], 'models.example.com')[0].content).toBe(replay?.blocks)
    expect(toAnthropicMessages([message], HOST)[0].content).toEqual([{ type: 'text', text: 'Hi' }])
  })

  it('explains a local server that isn’t running', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(run(custom('http://localhost:8080', ''))).rejects.toThrow('Check that Ollama or LM Studio is running')
  }, 15_000)
})

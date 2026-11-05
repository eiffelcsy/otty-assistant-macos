import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Capture, ChatEvent, HomeLanguage } from '../../shared/types'

let home: HomeLanguage | null = 'zh-HK'
let key = 'key'
let thinking = false
let baseUrl = 'https://api.deepseek.com/'
let apiFormat = 'auto'

vi.mock('electron', () => ({
  nativeImage: { createFromBitmap: () => ({ toPNG: () => Buffer.from('png') }) },
  app: { isPackaged: true, getPath: () => '' }
}))
vi.mock('../settings', () => ({
  getStored: () => ({ baseUrl, apiFormat, model: 'm', thinking, homeLanguage: home, rememberChats: false }),
  getApiKey: () => key
}))
vi.mock('../store', () => ({ chatStore: () => ({ write: async () => {} }), pruneOldChats: async () => {} }))
vi.mock('../files', () => ({ takeFiles: () => [] }))
vi.mock('../files/budget', () => ({ fileBudget: () => 0, fitFiles: () => [] }))
vi.mock('../tools', () => ({
  toolDefs: () => [{ type: 'function', function: { name: 'search_web' } }],
  toolLabel: () => ({ label: 'Looking up', icon: 'search' }),
  runTool: async () => ({ result: 'A result.', status: 'done' })
}))
const { ChatSession, explainTerm, testConnection } = await import('../llm')

interface Sent {
  role: string
  content: unknown
  reasoning_content?: string
}

let requests: { messages: Sent[] }[] = []
let replies: object[][] = []

const answer = (text: string) => [{ choices: [{ delta: { content: text } }] }]
const toolCall = (reasoning = '') => [
  {
    choices: [
      {
        delta: {
          ...(reasoning ? { reasoning_content: reasoning } : {}),
          tool_calls: [{ index: 0, id: 'call-1', function: { name: 'search_web', arguments: '{"query":"otters"}' } }]
        }
      }
    ]
  }
]

function stream(chunks: object[]): Response {
  return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n')
}

const snip: Capture = { id: 'c1', context: { kind: 'image', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 }, app: null }

beforeEach(() => {
  home = 'zh-HK'
  key = 'key'
  thinking = false
  baseUrl = 'https://api.deepseek.com/'
  apiFormat = 'auto'
  requests = []
  replies = []
  vi.useRealTimers()
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)))
    return stream(replies.shift() ?? answer('Done.'))
  })
})

/** Three turns of a chat that changes everything it can: the clock, the language, tools and a picture. */
async function chat(emit: (e: ChatEvent) => void = () => {}): Promise<void> {
  const session = new ChatSession(emit)
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 4, 9, 0, 1) })
  replies = [toolCall(), answer('Otters are mustelids.'), answer('牠們住在河邊。'), answer('That is an otter.')]
  await session.send('What are otters?', [], null)
  vi.setSystemTime(new Date(2026, 10, 4, 9, 7, 42))
  await session.send('牠們住在哪裏？', [], null)
  vi.setSystemTime(new Date(2026, 10, 5, 18, 30, 0))
  await session.send('And this?', [snip], { name: 'Safari' })
}

describe('what ChatSession sends', () => {
  it('only ever adds to the previous request, byte for byte', async () => {
    await chat()
    expect(requests).toHaveLength(4)
    for (let i = 1; i < requests.length; i++) {
      const before = requests[i - 1].messages
      const now = requests[i].messages
      expect(JSON.stringify(now.slice(0, before.length))).toBe(JSON.stringify(before))
      expect(now[before.length].role).toBe('assistant')
      expect(now.length).toBeGreaterThan(before.length)
    }
  })

  it('keeps the system prompt the same whatever the turn', async () => {
    await chat()
    const prompts = new Set(requests.map((r) => r.messages[0].content))
    expect(prompts.size).toBe(1)
    expect([...prompts][0]).not.toContain('2026')
  })

  it('gives a new chat the same start as the last one', async () => {
    await chat()
    const first = requests[0].messages[0]
    requests = []
    await new ChatSession(() => {}).send('Hello', [], null)
    expect(requests[0].messages[0]).toEqual(first)
  })

  it('puts the time and language at the end of the message and leaves them there', async () => {
    await chat()
    const [first, second] = requests[3].messages.filter((m) => m.role === 'user')
    expect(first.content).toMatch(/^What are otters\?\n\n\[Current local time: .*09:00 .*\]\n\(Please reply in English/)
    expect(second.content).toMatch(/^牠們住在哪裏？\n\n\[Current local time: .*09:07 .*\]\n\(Please reply in Traditional Chinese/)
  })

  it('adds the note after the picture', async () => {
    await chat()
    const last = requests[3].messages.at(-1) as { content: { type: string; text?: string }[] }
    expect(last.content.map((p) => p.type)).toEqual(['image_url', 'text', 'text'])
    expect(last.content[2].text).toMatch(/^\[Current local time: .*18:30 /)
  })

  it('never shows the note to the user', async () => {
    const events: ChatEvent[] = []
    await chat((e) => events.push(e))
    const asked = events.flatMap((e) => (e.type === 'user' ? [e.text] : []))
    expect(asked).toEqual(['What are otters?', '牠們住在哪裏？', 'And this?'])
  })

  it('has no language line or guide for English-only users', async () => {
    home = null
    await new ChatSession(() => {}).send('Hello', [], null)
    const [system, user] = requests[0].messages
    expect(system.content).not.toContain('打印')
    expect(user.content).toMatch(/^Hello\n\n\[Current local time: [^\n]*\]$/)
  })

  it('sends thinking back within a turn', async () => {
    replies = [toolCall('Let me search.'), answer('Found it.')]
    await new ChatSession(() => {}).send('Find otters', [], null)
    expect(requests[1].messages.find((m) => m.role === 'assistant')?.reasoning_content).toBe('Let me search.')
  })
})

describe('talking to the model', () => {
  const events = (session: (emit: (e: ChatEvent) => void) => InstanceType<typeof ChatSession>) => {
    const seen: ChatEvent[] = []
    return { seen, session: session((e) => seen.push(e)) }
  }
  const respond = (status: number, body = '') => vi.stubGlobal('fetch', async () => new Response(body, { status }))

  it('sends the same request shape as ever', async () => {
    let url = ''
    let headers: Record<string, string> = {}
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', async (u: string, init: RequestInit) => {
      url = u
      headers = init.headers as Record<string, string>
      body = JSON.parse(String(init.body))
      return stream(answer('Hi'))
    })
    thinking = true
    await new ChatSession(() => {}).send('Hello', [], null)
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer key' })
    expect(Object.keys(body)).toEqual(['model', 'thinking', 'messages', 'stream', 'tools'])
    expect(body).toMatchObject({ model: 'm', thinking: { type: 'enabled' }, stream: true })
  })

  it('streams text, and puts tool calls back together from their pieces', async () => {
    const piece = (args: string, first = false) => ({
      choices: [{ delta: { tool_calls: [{ index: 0, ...(first ? { id: 'c1', function: { name: 'search_', arguments: args } } : { function: { arguments: args } }) }] } }]
    })
    const named = { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'web' } }] } }] }
    replies = [[piece('{"query"', true), named, piece(':"otters"}')], [...answer('One '), ...answer('two')]]
    const { seen, session } = events((emit) => new ChatSession(emit))
    await session.send('Find otters', [], null)
    const sent = requests[1].messages.find((m) => m.role === 'assistant') as unknown as { tool_calls: unknown }
    expect(sent.tool_calls).toEqual([{ id: 'c1', type: 'function', function: { name: 'search_web', arguments: '{"query":"otters"}' } }])
    expect(seen.flatMap((e) => (e.type === 'delta' ? [e.text] : []))).toEqual(['One ', 'two'])
    expect(seen.at(-1)?.type).toBe('done')
  })

  it('stops offering tools after six rounds', async () => {
    replies = Array.from({ length: 7 }, () => toolCall())
    await new ChatSession(() => {}).send('Keep going', [], null)
    expect(requests).toHaveLength(7)
    expect(requests.map((r) => 'tools' in r)).toEqual([true, true, true, true, true, true, false])
  })

  it.each([
    [401, '', 'key doesn’t look right'],
    [402, '', 'balance is empty'],
    [429, '', 'lots of questions'],
    [503, '', 'having a moment'],
    [400, 'this model has no vision', 'can’t look at pictures'],
    [418, 'odd', 'error 418']
  ])('turns a %i into a friendly message', async (status, body, words) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    respond(status, body)
    const { seen, session } = events((emit) => new ChatSession(emit))
    await session.send('Hello', [], null)
    const error = seen.find((e) => e.type === 'error') as { message: string }
    expect(error.message).toContain(words)
  })

  it('explains a lost connection', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const { seen, session } = events((emit) => new ChatSession(emit))
    await session.send('Hello', [], null)
    expect(seen.find((e) => e.type === 'error')).toMatchObject({ message: expect.stringContaining('can’t reach the internet') })
  })

  it('asks for a key when there is none', async () => {
    key = ''
    const { seen, session } = events((emit) => new ChatSession(emit))
    await session.send('Hello', [], null)
    expect(seen.find((e) => e.type === 'error')).toMatchObject({ message: expect.stringContaining('needs a DeepSeek key') })
  })

  it('forgets a failed turn, so a dangling tool call can’t break the next one', async () => {
    let calls = 0
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      if (++calls === 2) return new Response('', { status: 500 })
      requests.push(JSON.parse(String(init.body)))
      return stream(calls === 1 ? toolCall() : answer('Fine'))
    })
    const session = new ChatSession(() => {})
    await session.send('First', [], null)
    await session.send('Second', [], null)
    expect(requests.at(-1)?.messages.map((m) => m.role)).toEqual(['system', 'user'])
  })

  it('stops part way through an answer', async () => {
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)))
      if (requests.length > 1) return stream(answer('Second answer'))
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(answer('Partial')[0])}\n\n`))
            init.signal?.addEventListener('abort', () => controller.error(new DOMException('Stopped', 'AbortError')))
          }
        })
      )
    })
    const { seen, session } = events((emit) => new ChatSession(emit))
    const turn = session.send('Tell me a story', [], null)
    await vi.waitFor(() => expect(seen.some((e) => e.type === 'delta')).toBe(true))
    session.stop()
    await turn
    expect(seen.at(-1)?.type).toBe('done')
    expect(seen.some((e) => e.type === 'error')).toBe(false)
    await session.send('Next', [], null)
    expect(requests[1].messages.map((m) => m.role)).toEqual(['system', 'user'])
  })

  it('explains a term with one short request and no system prompt', async () => {
    let body: { stream?: boolean; max_tokens?: number; messages?: Sent[] } = {}
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return Response.json({ choices: [{ message: { content: ' A meaning. ' } }] })
    })
    expect(await explainTerm('CDN', 'around')).toBe('A meaning.')
    expect(body).toMatchObject({ stream: false, max_tokens: 300 })
    expect(body.messages?.map((m) => m.role)).toEqual(['user'])
  })

  it('has kind words when an explanation fails or comes back empty', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ choices: [] }))
    expect(await explainTerm('CDN', '')).toContain('couldn’t think of')
    respond(401)
    expect(await explainTerm('CDN', '')).toContain('key doesn’t look right')
  })

  it('names the model when the connection works', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ model: 'deepseek-x', choices: [{ message: { content: 'Hi' } }] }))
    expect(await testConnection()).toEqual({ ok: true, message: 'Connected to deepseek-x! Otty is ready to help.' })
  })

  it('warns when the model can’t see pictures', async () => {
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) =>
      String(init.body).includes('image_url') ? new Response('no image support', { status: 400 }) : Response.json({ choices: [] })
    )
    const result = await testConnection()
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Connected to m! Heads up: this model can’t look at screen snips, but questions about text work fine.')
  })

  it('says why the connection failed', async () => {
    respond(401)
    expect(await testConnection()).toEqual({ ok: false, message: 'Otty’s key doesn’t look right. Please check it in Settings.' })
  })
})

describe('a local model', () => {
  beforeEach(() => {
    baseUrl = 'http://localhost:11434/v1'
  })

  it('works with no key saved', async () => {
    key = ''
    const seen: ChatEvent[] = []
    await new ChatSession((e) => seen.push(e)).send('Hello', [], null)
    expect(requests).toHaveLength(1)
    expect(seen.some((e) => e.type === 'error')).toBe(false)
  })

  it('never gets the key saved for an online service', async () => {
    let headers = {}
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      headers = init.headers as object
      return stream(answer('Hi'))
    })
    await new ChatSession(() => {}).send('Hello', [], null)
    expect(headers).not.toHaveProperty('Authorization')
  })

  it('is told it has no web tools', async () => {
    await new ChatSession(() => {}).send('Hello', [], null)
    const system = String(requests[0].messages[0].content)
    expect(system).not.toContain('search_web')
    expect(system).toContain("can't search the web")
  })
})

describe('another online service', () => {
  it('needs no key if it’s a custom address, and names itself when it does', async () => {
    baseUrl = 'https://models.example.com/v1'
    key = ''
    await new ChatSession(() => {}).send('Hello', [], null)
    expect(requests).toHaveLength(1)
    baseUrl = 'https://api.openai.com/v1'
    const seen: ChatEvent[] = []
    await new ChatSession((e) => seen.push(e)).send('Hello', [], null)
    expect(seen.find((e) => e.type === 'error')).toMatchObject({ message: expect.stringContaining('needs an OpenAI key') })
  })
})

describe('the API format', () => {
  it('uses the format the user chose for an unknown address', async () => {
    baseUrl = 'https://models.example.com'
    apiFormat = 'anthropic'
    let url = ''
    vi.stubGlobal('fetch', async (u: string | URL) => {
      url = String(u)
      return Response.json({ id: 'm', type: 'message', role: 'assistant', model: 'x', content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })
    })
    await explainTerm('CDN', '')
    expect(url).toBe('https://models.example.com/v1/messages')
    apiFormat = 'openai'
    vi.stubGlobal('fetch', async (u: string | URL) => {
      url = String(u)
      return Response.json({ choices: [] })
    })
    await explainTerm('CDN', '')
    expect(url).toBe('https://models.example.com/chat/completions')
  })
})

describe('a chat on Claude', () => {
  type Sent = { messages: { role: string; content: unknown }[]; system?: string; tools?: unknown; tool_choice?: unknown }
  let bodies: Sent[] = []
  let claudeReplies: Response[] = []

  /** A reply with thinking first, as Claude sends it. */
  function reply(blocks: Record<string, unknown>[], stop = 'end_turn'): Response {
    const events: object[] = [
      { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } }
    ]
    blocks.forEach((block, index) => {
      if (block.type === 'text') {
        events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
        events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })
      } else if (block.type === 'tool_use' || block.type === 'server_tool_use') {
        events.push({ type: 'content_block_start', index, content_block: { ...block, input: {} } })
        events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
      } else if (block.type === 'web_search_tool_result') {
        events.push({ type: 'content_block_start', index, content_block: block })
      } else {
        events.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } })
        events.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: block.signature } })
      }
      events.push({ type: 'content_block_stop', index })
    })
    events.push({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } })
    events.push({ type: 'message_stop' })
    const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  }

  const think = (n: number) => ({ type: 'thinking', thinking: '', signature: `sig-${n}` })
  const useTool = { type: 'tool_use', id: 'toolu_1', name: 'search_web', input: { query: 'otters' } }

  beforeEach(() => {
    baseUrl = 'https://api.anthropic.com'
    bodies = []
    claudeReplies = []
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return claudeReplies.shift() ?? reply([{ type: 'text', text: 'Done.' }])
    })
  })

  it('only ever adds to the last request, with thinking sent back unchanged', async () => {
    const session = new ChatSession(() => {})
    claudeReplies = [reply([think(1), useTool], 'tool_use'), reply([think(2), { type: 'text', text: 'Otters swim.' }]), reply([think(3), { type: 'text', text: 'Rivers.' }])]
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 4, 9, 0, 1) })
    await session.send('What are otters?', [], null)
    vi.setSystemTime(new Date(2026, 10, 4, 9, 7, 42))
    await session.send('Where do they live?', [], null)
    await session.send('Thanks', [], null)
    expect(bodies).toHaveLength(4)
    for (let i = 1; i < bodies.length; i++) {
      expect(bodies[i].system).toBe(bodies[0].system)
      expect(JSON.stringify(bodies[i].tools)).toBe(JSON.stringify(bodies[0].tools))
      const before = bodies[i - 1].messages
      expect(JSON.stringify(bodies[i].messages.slice(0, before.length))).toBe(JSON.stringify(before))
    }
    expect(JSON.stringify(bodies[3].messages)).toContain('sig-1')
    expect(JSON.stringify(bodies[3].messages)).toContain('sig-3')
  })

  it('shows a chip while Claude searches, and saves it with the answer', async () => {
    const search = { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'otters' } }
    const results = { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] }
    claudeReplies = [reply([search, results, { type: 'text', text: 'Found.' }])]
    const seen: ChatEvent[] = []
    await new ChatSession((e) => seen.push(e)).send('News?', [], null)
    const chips = seen.flatMap((e) => (e.type === 'tool' ? [[e.label, e.status]] : []))
    expect(chips).toEqual([
      ['Searching the web', 'running'],
      ['Searching the web', 'done']
    ])
  })

  it('resumes a paused turn by sending the same chat again, with no new message', async () => {
    const search = { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'otters' } }
    claudeReplies = [reply([think(1), search], 'pause_turn'), reply([{ type: 'text', text: 'Done searching.' }])]
    const seen: ChatEvent[] = []
    await new ChatSession((e) => seen.push(e)).send('Dig deep', [], null)
    expect(bodies).toHaveLength(2)
    expect(bodies[1].messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(JSON.stringify(bodies[1].messages[1].content)).toContain('srvtoolu_1')
    expect(seen.at(-1)?.type).toBe('done')
  })

  it('runs tools and sends the result back', async () => {
    claudeReplies = [reply([think(1), useTool], 'tool_use'), reply([{ type: 'text', text: 'Found it.' }])]
    const seen: ChatEvent[] = []
    await new ChatSession((e) => seen.push(e)).send('Find otters', [], null)
    expect(seen.some((e) => e.type === 'tool')).toBe(true)
    expect(bodies[1].messages.at(-1)).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'A result.' }] })
    expect(seen.at(-1)?.type).toBe('done')
  })

  it('keeps the tools listed on the last round, and turns them off instead', async () => {
    claudeReplies = Array.from({ length: 7 }, () => reply([useTool], 'tool_use'))
    await new ChatSession(() => {}).send('Keep going', [], null)
    expect(bodies).toHaveLength(7)
    expect(bodies[6].tools).toEqual(bodies[0].tools)
    expect(bodies[6].tool_choice).toEqual({ type: 'none' })
    expect(bodies[5]).not.toHaveProperty('tool_choice')
  })

  it('shows a kind message for a refusal, and forgets the turn', async () => {
    claudeReplies = [reply([], 'refusal'), reply([{ type: 'text', text: 'Fine.' }])]
    const seen: ChatEvent[] = []
    const session = new ChatSession((e) => seen.push(e))
    await session.send('Something it declines', [], null)
    expect(seen.find((e) => e.type === 'error')).toMatchObject({ message: expect.stringContaining('can’t help with that one') })
    await session.send('Something else', [], null)
    expect(bodies[1].messages.map((m) => m.role)).toEqual(['user'])
  })

  it('carries on after switching to DeepSeek, which never sees Claude’s record', async () => {
    const session = new ChatSession(() => {})
    claudeReplies = [reply([think(1), { type: 'text', text: 'Hello from Claude.' }])]
    await session.send('Hi', [], null)
    baseUrl = 'https://api.deepseek.com'
    let body = ''
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      body = String(init.body)
      return stream(answer('Hello from DeepSeek.'))
    })
    await session.send('Still there?', [], null)
    expect(body).toContain('Hello from Claude.')
    expect(body).not.toContain('sig-1')
    expect(body).not.toContain('"provider"')
  })

  it('carries on after switching from DeepSeek, tool round included', async () => {
    baseUrl = 'https://api.deepseek.com'
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)))
      return stream(replies.shift() ?? answer('Done.'))
    })
    const session = new ChatSession(() => {})
    replies = [toolCall(), answer('Otters are mustelids.')]
    await session.send('Find otters', [], null)
    baseUrl = 'https://api.anthropic.com'
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return reply([{ type: 'text', text: 'Yes.' }])
    })
    await session.send('Sure?', [], null)
    expect(bodies[0].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
    expect(bodies[0].messages[1].content).toEqual([{ type: 'tool_use', id: 'call-1', name: 'search_web', input: { query: 'otters' } }])
  })
})

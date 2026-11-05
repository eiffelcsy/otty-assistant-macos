import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Capture, ChatEvent, HomeLanguage } from '../../shared/types'

let home: HomeLanguage | null = 'zh-HK'

vi.mock('electron', () => ({ nativeImage: {}, app: { isPackaged: true, getPath: () => '' } }))
vi.mock('../settings', () => ({
  getStored: () => ({ baseUrl: 'https://api.test', model: 'm', thinking: false, homeLanguage: home, rememberChats: false }),
  getApiKey: () => 'key'
}))
vi.mock('../store', () => ({ chatStore: () => ({ write: async () => {} }), pruneOldChats: async () => {} }))
vi.mock('../files', () => ({ takeFiles: () => [] }))
vi.mock('../files/budget', () => ({ fitFiles: () => [] }))
vi.mock('../tools', () => ({
  toolDefs: () => [{ type: 'function', function: { name: 'search_web' } }],
  toolLabel: () => ({ label: 'Looking up', icon: 'search' }),
  runTool: async () => ({ result: 'A result.', status: 'done' })
}))
const { ChatSession } = await import('../llm')

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

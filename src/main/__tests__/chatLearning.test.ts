import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Capture, ChatEvent } from '../../shared/types'
import { openDatabase } from '../store/db'
import { MemoryStore } from '../memory/store'

let learn = true
let thinking = false
let db = openDatabase(':memory:')
let store: MemoryStore

vi.mock('electron', () => ({
  nativeImage: {},
  clipboard: {},
  shell: {},
  ClipboardItem: class {},
  app: { isPackaged: true, getPath: () => '' }
}))
vi.mock('../settings', () => ({
  getStored: () => ({ baseUrl: 'https://api.deepseek.com/', apiFormat: 'auto', model: 'm', thinking, homeLanguage: null, rememberChats: false, learn }),
  getApiKey: () => 'key'
}))
vi.mock('../store', () => ({ chatStore: () => ({ write: async () => {} }), pruneOldChats: async () => {}, database: () => db }))
vi.mock('../files', () => ({ takeFiles: () => [] }))
vi.mock('../files/budget', () => ({ fileBudget: () => 0, fitFiles: () => [] }))
vi.mock('../memory', async (original) => ({ ...(await original<typeof import('../memory')>()), memoryStore: () => store }))

const { ChatSession } = await import('../llm')
const { loadMath } = await import('../math')
await loadMath()

interface Sent {
  messages: { role: string; content: unknown }[]
  thinking?: { type: string }
  tools?: { function: { name: string } }[]
}
let requests: Sent[] = []
let replies: object[][] = []

const say = (text: string) => [{ choices: [{ delta: { content: text } }] }]
const call = (name: string, args: object, id = 'c1') => [{ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } }] }]

function session() {
  const events: ChatEvent[] = []
  return { chat: new ChatSession((e) => events.push(e)), events }
}

const lastUser = () => String(requests.at(-1)!.messages.filter((m) => m.role === 'user').at(-1)!.content)
const selection = (text: string): Capture => ({ id: 'c', context: { kind: 'text', text }, app: null })

function answerWith(other?: (url: string) => Response | undefined) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const elsewhere = other?.(String(url))
    if (elsewhere) return elsewhere
    requests.push(JSON.parse(String(init.body)))
    const chunks = replies.shift() ?? say('OK')
    return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n')
  })
}

beforeEach(() => {
  learn = true
  thinking = false
  db = openDatabase(':memory:')
  store = new MemoryStore(db)
  requests = []
  replies = []
  answerWith()
})

describe('learning in a chat', () => {
  it('saves with no card, shows a note, and undo takes it back', async () => {
    const { chat, events } = session()
    replies = [call('remember', { text: 'Is learning Spanish' }), say('¡Qué bien!')]
    await chat.send('I’m learning Spanish for a trip', [], null)
    expect(events.some((e) => e.type === 'confirm')).toBe(false)
    expect(events.filter((e) => e.type === 'tool')).toEqual([]) // the Noted line stands in for a chip
    const memory = events.find((e) => e.type === 'memory') as Extract<ChatEvent, { type: 'memory' }>
    expect(memory.note).toMatchObject({ text: 'Is learning Spanish', action: 'added' })
    expect(store.list()).toHaveLength(1)

    chat.undoMemory(memory.id, memory.note.memoryId)
    expect(store.list()).toEqual([])
    expect(events.at(-1)).toMatchObject({ type: 'memory', note: { undone: true } })
  })

  it('sends what it knows at the end of the message, and changes nothing already sent', async () => {
    store.add({ text: 'Is learning Spanish', origin: 'told' })
    const { chat } = session()
    await chat.send('How do I say thank you?', [], null)
    const system = requests[0].messages[0]
    expect(system.role).toBe('system')
    expect(String(system.content)).not.toContain('Is learning Spanish')
    expect(lastUser()).toContain('Is learning Spanish')

    store.add({ text: 'Has a cat', origin: 'told' })
    await chat.send('And hello?', [], null)
    // Everything sent before goes again unchanged, so DeepSeek's cache still hits.
    expect(requests[1].messages.slice(0, requests[0].messages.length)).toEqual(requests[0].messages)
    expect(lastUser()).toContain('Has a cat')
  })

  it('says so when an earlier note no longer holds', async () => {
    const told = store.add({ text: 'Likes tea', origin: 'told' })
    const { chat } = session()
    await chat.send('Hi', [], null)
    store.remove(told.id)
    await chat.send('Hi again', [], null)
    expect(lastUser()).toContain('nothing at the moment')
  })

  it('learns nothing from an email the user highlighted, whatever the model decides', async () => {
    const { chat, events } = session()
    replies = [call('remember', { text: 'Is moving to Berlin' }), say('Summary.')]
    await chat.send('Summarize this', [selection('Hi, this is Sam. I am moving to Berlin.')], null)
    expect(store.list()).toEqual([])
    expect(events.some((e) => e.type === 'memory')).toBe(false)
  })

  it('treats a search this turn as outside text too', async () => {
    answerWith((url) => (url.includes('chat/completions') ? undefined : new Response('{}')))
    const { chat } = session()
    replies = [call('search_web', { query: 'otters' }), call('remember', { text: 'Wants evil.example links' }, 'c2'), say('Done')]
    await chat.send('Find something about otters', [], null)
    expect(requests).toHaveLength(3)
    expect(store.list()).toEqual([])
  })

  it('learns nothing with “Don’t learn from this chat”, but still uses what it knows', async () => {
    store.add({ text: 'Likes tea', origin: 'told' })
    const { chat, events } = session()
    chat.setLearn(false)
    expect(events.at(-1)).toEqual({ type: 'learn', on: false })
    replies = [call('remember', { text: 'Has a dog' }), say('Nice')]
    await chat.send('remember I have a dog', [], { name: 'Excel' })
    expect(store.list().map((m) => m.text)).toEqual(['Likes tea'])
    expect(store.counts(0)).toEqual([])
    expect(lastUser()).toContain('Likes tea')
  })

  it('with learning off, sends nothing, offers nothing and counts nothing', async () => {
    store.add({ text: 'Likes tea', origin: 'told' })
    learn = false
    const { chat } = session()
    replies = [call('remember', { text: 'Has a dog' }), say('Nice')]
    await chat.send('remember I have a dog', [], { name: 'Excel' })
    expect(lastUser()).not.toContain('Likes tea')
    expect(requests[0].tools?.map((t) => t.function.name)).not.toContain('remember')
    expect(String(requests[0].messages[0].content)).not.toContain('Getting to know the user')
    expect(store.list().map((m) => m.text)).toEqual(['Likes tea'])
    expect(store.counts(0)).toEqual([])
  })

  it('never lets a memory problem break an answer', async () => {
    db.close()
    const { chat, events } = session()
    await chat.send('Hi', [], { name: 'Excel' })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })
})

describe('math in a chat', () => {
  it('answers a typed sum with no request at all', async () => {
    const { chat, events } = session()
    await chat.send('17.5% of 2,340', [], null)
    expect(requests).toEqual([])
    expect(events.find((e) => e.type === 'calc')).toMatchObject({ expression: '17.5% of 2,340', result: '409.5' })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('remembers the sum, so Explain the working can follow on, and thinks about it', async () => {
    const { chat } = session()
    await chat.send('17.5% of 2,340', [], null)
    await chat.send('Explain the working', [], null, { action: 'working' })
    expect(requests).toHaveLength(1)
    expect(JSON.stringify(requests[0].messages)).toContain('17.5% of 2,340 = 409.5')
    expect(requests[0].thinking).toEqual({ type: 'enabled' })
  })

  it('falls through to the model when it can’t read the sum', async () => {
    const { chat } = session()
    await chat.send('2 apples + 3 pears', [], null)
    expect(requests).toHaveLength(1)
  })

  it('never answers locally about a capture', async () => {
    const { chat } = session()
    await chat.send('2 + 2', [selection('some text')], null)
    expect(requests).toHaveLength(1)
  })

  it('shows one finished chip for a calculation, with no running state', async () => {
    const { chat, events } = session()
    replies = [call('calculate', { steps: ['base = 2340 * 17.5%', 'tax = base * 8%', 'total = base + tax'] }), say('It comes to 442.26.')]
    await chat.send('What’s 17.5% of 2,340 plus 8% tax?', [], null)
    const chips = events.filter((e) => e.type === 'tool')
    expect(chips).toHaveLength(1)
    expect(chips[0]).toMatchObject({ status: 'done', label: 'Calculated total = 442.26', copy: '442.26' })
    expect(requests).toHaveLength(2)
    expect(requests[1].messages.at(-1)).toMatchObject({ role: 'tool', content: expect.stringContaining('total = 442.26') })
    expect(requests[0].thinking).toEqual({ type: 'disabled' })
  })

  it('thinks only about real problems, unless told to always think', async () => {
    const { chat } = session()
    await chat.send('Solve 3x + 7 = 25', [], null)
    expect(requests[0].thinking).toEqual({ type: 'enabled' })
    await chat.send('What’s the capital of France?', [], null)
    expect(requests[1].thinking).toEqual({ type: 'disabled' })
    thinking = true
    await chat.send('What’s the capital of Japan?', [], null)
    expect(requests[2].thinking).toEqual({ type: 'enabled' })
  })
})

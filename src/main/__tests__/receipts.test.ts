import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent, ConfirmCard, Receipt } from '../../shared/types'
import type { Thread } from '../store'

// Confirm cards and receipts (D-60), through a real ChatSession and the real tools, with the network and the Mac faked.

vi.mock('electron', () => ({
  clipboard: {},
  ClipboardItem: class {},
  shell: {},
  nativeImage: {},
  app: { isPackaged: true, getPath: () => '' }
}))
vi.mock('../settings', () => ({ getConnections: () => [], saveConnections: () => {}, keychain: () => ({ available: () => false, lock: (s: string) => s, unlock: (s: string) => s }), isDev: () => false,
  getStored: () => ({ baseUrl: 'https://api.deepseek.com/', apiFormat: 'auto', model: 'm', thinking: false, homeLanguage: null, rememberChats: true, learn: false }),
  getApiKey: () => 'key'
}))
vi.mock('../store', () => ({ chatStore: () => ({}), pruneOldChats: async () => 0 }))
vi.mock('../files', () => ({ takeFiles: () => [] }))

const { ChatSession } = await import('../llm')
const { liveDeps } = await import('../sessionDeps')
const { MemoryLedger, setLedger } = await import('../ledger')
const { pageCard } = await import('../cards')
const { TOOLS } = await import('../tools')

let replies: object[][] = []
const call = (id: string, name: string, args: object) => [{ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } }] }]
const say = (text: string) => [{ choices: [{ delta: { content: text } }] }]

beforeEach(() => {
  replies = []
  vi.stubGlobal('fetch', async () => {
    const chunks = replies.shift() ?? say('Done.')
    return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n')
  })
})

function rig(answer?: (card: ConfirmCard) => boolean | undefined) {
  const events: ChatEvent[] = []
  const saved = new Map<string, Thread>()
  const removed: string[] = []
  const ledger = new MemoryLedger()
  setLedger(() => ledger)
  const deps = {
    ...liveDeps,
    settings: () => ({ ...liveDeps.settings(), rememberChats: true }),
    ledger: () => ledger,
    chats: () => ({ write: async (t: Thread) => void saved.set(t.id, structuredClone(t)), get: async (id: string) => structuredClone(saved.get(id)) ?? null }) as never,
    pruneChats: async () => 0,
    mac: { open: async () => {}, copy: async () => false, remind: async () => 'x-apple-reminder://R1', unremind: async (id: string) => void removed.push(id) }
  }
  const session = new ChatSession(
    (e) => {
      events.push(e)
      const yes = e.type === 'confirm' ? answer?.(e.card) : undefined
      if (e.type === 'confirm' && yes !== undefined) queueMicrotask(() => session.respondConfirm(e.confirmId, yes))
    },
    {},
    deps
  )
  const receipts = () => events.flatMap((e) => (e.type === 'receipt' ? [e.receipt] : []))
  return { session, events, saved, removed, ledger, receipts }
}

describe('receipts (D-60)', () => {
  it('leaves “Added” with an Undo that removes that reminder, and both survive reopening the chat', async () => {
    const { session, events, saved, removed, ledger, receipts } = rig(() => true)
    replies = [call('c1', 'create_reminder', { title: 'Call mum' }), say('Added.')]
    await session.send('Remind me to call mum', [], null)
    const answerId = events.find((e) => e.type === 'start')!.id
    expect(receipts().at(-1)).toEqual<Receipt>({ allowed: true, verb: 'Added', what: '“Call mum”', undo: { kind: 'reminder', ref: 'x-apple-reminder://R1', label: 'Remove the reminder “Call mum”' } })

    expect(await session.undoReceipt(answerId, 0)).toBe(true)
    expect(removed).toEqual(['x-apple-reminder://R1'])
    expect(ledger.list()[0].undoneAt).toBeTruthy()
    expect(await session.undoReceipt(answerId, 0)).toBe(false)

    const threadId = session.threadId
    session.reset()
    await vi.waitFor(() => expect(saved.get(threadId)).toBeTruthy())
    await session.open(threadId)
    const load = [...events].reverse().find((e) => e.type === 'load') as Extract<ChatEvent, { type: 'load' }>
    const reopened = load.messages.find((m) => m.id === answerId)
    expect(reopened?.role === 'assistant' && reopened.receipts).toEqual([expect.objectContaining({ verb: 'Added', undone: true })])
  })

  it('takes a reminder back from the Logbook too, and the chat’s receipt agrees (D-63)', async () => {
    const { session, events, removed, ledger, receipts } = rig(() => true)
    replies = [call('c1', 'create_reminder', { title: 'Call mum' }), say('Added.')]
    await session.send('Remind me to call mum', [], null)
    const [row] = ledger.list()
    session.reset()
    const before = events.length
    expect(await session.undoChange(row.id)).toBe(true)
    expect(removed).toEqual(['x-apple-reminder://R1'])
    expect(ledger.get(row.id)?.undoneAt).toBeTruthy()
    expect(await session.undoChange(row.id)).toBe(false)
    // That chat isn't on show, so no window hears about it; it reads as undone when it opens.
    expect(events.slice(before)).toEqual([])
    expect(receipts().at(-1)?.undone).toBeUndefined()
    await session.open(row.chatId!)
    const load = [...events].reverse().find((e) => e.type === 'load') as Extract<ChatEvent, { type: 'load' }>
    const answer = load.messages.find((m) => m.id === row.answerId)
    expect(answer?.role === 'assistant' && answer.receipts?.[0]).toMatchObject({ verb: 'Added', undone: true })
    expect(await session.undoReceipt(row.answerId!, 0)).toBe(false)
  })

  it('says Skipped, and needs no Undo, when the user skips', async () => {
    const { session, receipts } = rig(() => false)
    replies = [call('c1', 'open_url', { url: 'https://example.com/a' }), say('OK.')]
    await session.send('Open example.com', [], null)
    expect(receipts()).toEqual([{ allowed: false, verb: 'Skipped', what: 'example.com' }])
  })

  it('records the skip when a new question stops a card that was waiting', async () => {
    const { session, events, receipts } = rig()
    replies = [call('c1', 'open_url', { url: 'https://example.com/a' })]
    const first = session.send('Open example.com', [], null)
    await vi.waitFor(() => expect(events.some((e) => e.type === 'confirm')).toBe(true))
    replies = [say('Sure.')]
    await session.send('Never mind, what’s 2+2 in words?', [], null)
    await first
    expect(receipts()).toEqual([{ allowed: false, verb: 'Skipped', what: 'example.com', why: 'you asked something else' }])
  })
})

describe('the card shows the host the tool reaches (D-60)', () => {
  const tricky = [
    'https://accounts.google.com@evil.example/login',
    'https://user:pass@shop.example.:8443/cart?x=1',
    'https://аpple.com/',
    'http://bank.example/',
    'https://jreast.co.jp/en/timetable/tokyo-sendai/with/a/very/long/path/that/goes/on?and=a&query=too'
  ]

  it.each(tricky)('%s', async (url) => {
    let card: ConfirmCard | undefined
    let opened = ''
    await TOOLS.open_url.run({ url }, { allowed: new Set(['open_url']), knownUrl: () => false, confirm: async (c) => ((card = c), true), mac: { open: async (u) => void (opened = u), copy: async () => false, remind: async () => '', unremind: async () => {} } })
    expect(card).toEqual(pageCard('open', url))
    expect(card!.host).toBe(new URL(opened).host)
  })

  it('marks another alphabet and plain http, and nothing else', () => {
    expect(pageCard('read', 'https://аpple.com/')).toMatchObject({ host: 'xn--pple-43d.com', readable: 'аpple.com', unusual: 'alphabet' })
    expect(pageCard('read', 'http://bank.example/').unusual).toBe('http')
    expect(pageCard('read', 'https://accounts.google.com@evil.example/login')).toEqual({ kind: 'read', title: 'Read this page?', yes: 'Read it', host: 'evil.example', rest: '/login' })
    expect(pageCard('read', 'https://jreast.co.jp/en/timetable/tokyo-sendai/with/a/very/long/path/that/goes/on?and=a&query=too').rest).toMatch(/^\/en\/timetable.*….*query=too$/)
  })
})

describe('use cards (D-54)', () => {
  it('leaves “Used” with the service and the tool, and “Skipped” when refused', async () => {
    const { connectionCard, receiptFor } = await import('../cards')
    const card = connectionCard('Notion', 'Open a page', 'abc', true)
    expect(card).toMatchObject({ kind: 'use', title: 'Send this to Notion?', yes: 'Send' })
    expect(receiptFor(card, true)).toEqual({ allowed: true, verb: 'Used', what: 'Notion: Open a page' })
    expect(receiptFor(connectionCard('Tasks', 'Create issue', '{}'), false, 'Skipped')).toMatchObject({ allowed: false, verb: 'Skipped' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent, ConfirmCard, Receipt } from '../../shared/types'
import type { Thread } from '../store'

// D-73: plan_event through a real ChatSession: a card, then the event saved or not, its ledger row and its Undo.

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
const { MemoryEventStore } = await import('../calendar/store')
const { MemorySentLog, setSentLog } = await import('../sent')

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

const plan = { title: 'Essay writing', start: '2026-12-04T14:00', end: '2026-12-04T16:00' }

function rig(answer: (card: ConfirmCard) => boolean = () => true) {
  const events: ChatEvent[] = []
  const ledger = new MemoryLedger()
  const store = new MemoryEventStore()
  const sent = new MemorySentLog()
  setLedger(() => ledger)
  setSentLog(() => sent)
  const deps = {
    ...liveDeps,
    settings: () => ({ ...liveDeps.settings(), rememberChats: true }),
    ledger: () => ledger,
    chats: () => ({ write: async (_t: Thread) => {}, get: async () => null }) as never,
    pruneChats: async () => 0,
    eventStore: () => store,
    mac: { open: async () => {}, copy: async () => false, remind: async () => 'x', unremind: async () => {} }
  }
  const session = new ChatSession(
    (e) => {
      events.push(e)
      if (e.type === 'confirm') {
        const yes = answer(e.card)
        queueMicrotask(() => session.respondConfirm(e.confirmId, yes))
      }
    },
    {},
    deps
  )
  const receipts = () => events.flatMap((e): Receipt[] => (e.type === 'receipt' ? [e.receipt] : []))
  return { session, events, ledger, store, sent, receipts }
}

describe('plan_event (D-73)', () => {
  it('shows an event card, then saves the event as Otty’s, with a ledger row and an Undo', async () => {
    const { session, events, ledger, store, receipts } = rig()
    replies = [call('c1', 'plan_event', plan), say('Planned.')]
    await session.send('Block two hours for essay writing on Friday afternoon', [], null)

    const card = events.find((e) => e.type === 'confirm')
    expect(card?.type === 'confirm' && card.card).toEqual({ kind: 'event', title: 'Add this to your calendar?', yes: 'Add it', item: 'Essay writing', when: expect.stringMatching(/^\w{3} 4 Dec, 14:00–16:00$/) })
    const [saved] = store.range(0, Date.now() + 1e12)
    expect(saved).toMatchObject({ title: 'Essay writing', madeBy: 'otty', allDay: false, chatId: session.threadId })
    const [row] = ledger.list()
    expect(row).toMatchObject({ tool: 'plan_event', undo: 'event', ref: saved.id, status: 'done' })
    expect(receipts().at(-1)).toMatchObject({ allowed: true, verb: 'Added to your calendar', what: '“Essay writing”', undo: { kind: 'event', ref: saved.id } })
  })

  it('takes the event back from the Logbook, and the ledger row says so', async () => {
    const { session, ledger, store } = rig()
    replies = [call('c1', 'plan_event', plan), say('Planned.')]
    await session.send('Block two hours for essay writing', [], null)
    const [row] = ledger.list()
    expect(await session.undoChange(row.id)).toBe(true)
    expect(store.range(0, Date.now() + 1e12)).toEqual([])
    expect(ledger.get(row.id)?.undoneAt).toBeTruthy()
    expect(await session.undoChange(row.id)).toBe(false)
  })

  it('takes it back from the chat’s receipt too', async () => {
    const { session, events, store } = rig()
    replies = [call('c1', 'plan_event', plan), say('Planned.')]
    await session.send('Block two hours for essay writing', [], null)
    const answerId = events.find((e) => e.type === 'start')!.id
    expect(await session.undoReceipt(answerId, 0)).toBe(true)
    expect(store.range(0, Date.now() + 1e12)).toEqual([])
  })

  it('saves nothing when the user skips the card', async () => {
    const { session, ledger, store, receipts } = rig(() => false)
    replies = [call('c1', 'plan_event', plan), say('OK.')]
    await session.send('Block two hours for essay writing', [], null)
    expect(store.range(0, Date.now() + 1e12)).toEqual([])
    expect(receipts()).toEqual([{ allowed: false, verb: 'Skipped', what: '“Essay writing”' }])
    // A declined card is written down as denied, like every tool's, and nothing is undone.
    expect(ledger.list().map((r) => r.status)).toEqual(['denied'])
  })

  it('refuses a bad time with an error, and never shows a card', async () => {
    const { session, events, store } = rig()
    replies = [call('c1', 'plan_event', { title: 'Essay', start: 'Friday afternoon', end: '2026-12-04T16:00' }), say('Sorry.')]
    await session.send('Block time for essay', [], null)
    expect(events.some((e) => e.type === 'confirm')).toBe(false)
    expect(store.range(0, Date.now() + 1e12)).toEqual([])
  })

  it('refuses an end before the start, and a span over 14 days', async () => {
    const { session, events } = rig()
    replies = [
      call('c1', 'plan_event', { title: 'Essay', start: '2026-12-04T16:00', end: '2026-12-04T14:00' }),
      call('c2', 'plan_event', { title: 'Trip', start: '2026-12-01', end: '2026-12-20', all_day: true }),
      say('Sorry.')
    ]
    await session.send('Plan two things', [], null)
    expect(events.some((e) => e.type === 'confirm')).toBe(false)
  })

  it('stores a day-only all-day end as the last day, so the event covers it', async () => {
    const { session, store } = rig()
    replies = [call('c1', 'plan_event', { title: 'Conference', start: '2026-12-05', end: '2026-12-07', all_day: true }), say('Planned.')]
    await session.send('Put the conference on my calendar', [], null)
    const [saved] = store.range(0, Date.now() + 1e12)
    expect(saved).toMatchObject({ allDay: true, start: new Date(2026, 11, 5).getTime(), end: new Date(2026, 11, 8).getTime() })
  })

  it('records nothing in What left your Mac for planning an event', async () => {
    const { session, sent } = rig()
    replies = [call('c1', 'plan_event', plan), say('Planned.')]
    await session.send('Block two hours for essay writing', [], null)
    const kinds = sent.list().map((r) => r.kind)
    expect(kinds).not.toEqual(expect.arrayContaining(['connection', 'search', 'page', 'job']))
    expect(sent.list().some((r) => r.what.includes('Essay writing'))).toBe(false)
  })
})

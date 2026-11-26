import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent } from '../../shared/types'

// Try again and Edit (D-36), through a real ChatSession and the real tools, with the network stubbed.

vi.mock('electron', () => ({
  clipboard: { writeText: async () => {}, write: async () => {} },
  ClipboardItem: class {},
  shell: { openExternal: async () => {} },
  nativeImage: { createFromBitmap: () => ({ toPNG: () => Buffer.from('png') }) },
  app: { isPackaged: true, getPath: () => '' }
}))
vi.mock('../settings', () => ({ getConnections: () => [], saveConnections: () => {}, keychain: () => ({ available: () => false, lock: (s: string) => s, unlock: (s: string) => s }), isDev: () => false,
  getStored: () => ({ baseUrl: 'https://api.deepseek.com/', apiFormat: 'auto', model: 'm', thinking: false, homeLanguage: null, rememberChats: false, learn: false }),
  getApiKey: () => 'key'
}))
vi.mock('../store', () => ({ chatStore: () => ({ write: async () => {}, delete: async () => {} }), pruneOldChats: async () => {} }))
vi.mock('../files', () => ({ takeFiles: () => [] }))

const { ChatSession } = await import('../llm')
const { MemoryLedger, canUndo, setLedger } = await import('../ledger')

let requests: { messages: unknown[] }[] = []
let replies: object[][] = []
const call = (id: string, name: string, args: object) => [{ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } }] }]
const answer = (text: string) => [{ choices: [{ delta: { content: text } }] }]

beforeEach(() => {
  requests = []
  replies = []
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)))
    const chunks = replies.shift() ?? answer('Done.')
    return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n')
  })
})

function rig() {
  const events: ChatEvent[] = []
  const started: string[] = []
  const withdrawn: string[] = []
  const session = new ChatSession(
    (e) => {
      events.push(e)
      // Say yes to every card, as the user would.
      if (e.type === 'confirm') queueMicrotask(() => session.respondConfirm(e.confirmId, true))
    },
    {
      startJob: async (job) => {
        started.push(job.id)
        return null
      },
      jobLive: async (id) => started.includes(id) && !withdrawn.includes(id),
      withdrawJob: async (id) => void withdrawn.push(id)
    }
  )
  const answers = () => events.flatMap((e) => (e.type === 'start' ? [e.id] : []))
  const settle = () => vi.waitFor(() => expect(events.filter((e) => e.type === 'done').length).toBe(answers().length))
  return { session, events, started, withdrawn, answers, settle }
}

describe('try again and edit (D-36)', () => {
  it('lists what the answer did, undoes what was ticked, and sends the same question again byte for byte', async () => {
    const { session, started, withdrawn, answers, settle } = rig()
    replies = [
      call('c1', 'copy_to_clipboard', { text: 'Hello' }),
      call('c2', 'start_job', { title: 'Laptops', brief: 'Compare laptops under $1,000.' }),
      answer('Copied, and I’m looking into laptops.')
    ]
    await session.send('Copy hello and look into laptops', [], null)
    const first = requests[0]
    const [id] = answers()

    const plan = await session.rewindPlan(id)
    expect(plan?.undo).toEqual([{ id: `job:${started[0]}`, label: 'Stop looking into “Laptops”' }])
    expect(plan?.lasting).toEqual(['Copied.'])

    requests = []
    replies = [answer('A second go.')]
    expect(await session.rewind(id, [`job:${started[0]}`], 'retry')).toBeNull()
    await settle()
    expect(withdrawn).toEqual(started)
    expect(JSON.stringify(requests[0])).toBe(JSON.stringify(first))
  })

  it('leaves an unticked look running', async () => {
    const { session, withdrawn, answers, settle } = rig()
    replies = [call('c1', 'start_job', { title: 'Laptops', brief: 'Compare laptops.' }), answer('Started.')]
    await session.send('Look into laptops', [], null)
    await session.rewind(answers()[0], [], 'retry')
    await settle()
    expect(withdrawn).toEqual([])
  })

  it('Edit hands the question back and removes the whole turn', async () => {
    const { session, events, answers } = rig()
    const highlight = { id: 'c1', context: { kind: 'text' as const, text: 'Requests beyond your plan return HTTP 429.' }, app: { name: 'Safari' } }
    await session.send('Explain this', [highlight], null)
    const draft = await session.rewind(answers()[0], [], 'edit')
    expect(draft).toEqual({ text: 'Explain this', captures: [highlight], files: [] })
    const load = events.filter((e) => e.type === 'load').at(-1) as Extract<ChatEvent, { type: 'load' }>
    expect(load.messages).toEqual([])
    // The next question starts the chat afresh, with nothing of the old turn in it.
    requests = []
    await session.send('Explain this simply', [highlight], null)
    expect(requests[0].messages.filter((m) => (m as { role: string }).role === 'user')).toHaveLength(1)
  })

  it('only takes back the latest turn, and nothing while it is still answering', async () => {
    const { session, answers } = rig()
    await session.send('One', [], null)
    await session.send('Two', [], null)
    const [older, latest] = answers()
    expect(await session.rewindPlan(older)).toBeNull()
    expect(await session.rewind(older, [], 'retry')).toBeNull()
    expect(await session.rewindPlan(latest)).toEqual({ undo: [], lasting: [] })
  })

  it('keeps the earlier turns as they were sent, so the cache holds', async () => {
    const { session, answers, settle } = rig()
    await session.send('One', [], null)
    await session.send('Two', [], null)
    const before = requests[1]
    requests = []
    await session.rewind(answers()[1], [], 'retry')
    await settle()
    expect(JSON.stringify(requests[0])).toBe(JSON.stringify(before))
  })

  it('with a twist, sends exactly what Try again would, plus one line after the question (D-58)', async () => {
    const { session, answers, settle } = rig()
    await session.send('One', [], null)
    await session.send('Explain HTTP 429', [], null)
    const before = requests[1] as { messages: { role: string; content: unknown }[] }
    requests = []
    await session.rewind(answers()[1], [], 'retry', 'shorter')
    await settle()
    const sent = requests[0] as typeof before
    const question = before.messages.at(-1)!
    expect({ ...sent, messages: [] }).toEqual({ ...before, messages: [] })
    expect(sent.messages.slice(0, -1)).toEqual(before.messages.slice(0, -1))
    expect(sent.messages.at(-1)).toEqual({ ...question, content: `${String(question.content)}\n\nAnswer this again, shorter than last time.` })
  })

  it('reads its list from the action ledger, the same as from the answer, and marks what it undid (D-46)', async () => {
    const log = new MemoryLedger()
    setLedger(() => log)
    try {
      const { session, started, answers } = rig()
      replies = [
        call('c1', 'copy_to_clipboard', { text: 'Hello' }),
        call('c2', 'start_job', { title: 'Laptops', brief: 'Compare laptops under $1,000.' }),
        answer('Copied, and I’m looking into laptops.')
      ]
      await session.send('Copy hello and look into laptops', [], null)
      const [id] = answers()
      expect(log.list().map((r) => [r.summary, r.status, canUndo(r)])).toEqual([
        ['Started. The user will find the report in the Logbook.', 'done', true],
        ['Copied.', 'done', false]
      ])
      const plan = await session.rewindPlan(id)
      expect(plan).toEqual({ undo: [{ id: `job:${started[0]}`, label: 'Stop looking into “Laptops”' }], lasting: ['Copied.'] })
      replies = [answer('Again.')]
      await session.rewind(id, [`job:${started[0]}`], 'retry')
      expect(log.list().find((r) => r.undo === 'job')?.undoneAt).toBeTruthy()
    } finally {
      setLedger(() => null)
    }
  })
})

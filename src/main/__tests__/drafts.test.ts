import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent } from '../../shared/types'
import type { Thread } from '../store'

// D-62: the message box's words kept per chat in main, stopped answers, and failures by kind.

vi.mock('electron', () => ({ clipboard: {}, ClipboardItem: class {}, shell: {}, nativeImage: {}, app: { isPackaged: true, getPath: () => '' } }))
vi.mock('../settings', () => ({ getConnections: () => [], saveConnections: () => {}, keychain: () => ({ available: () => false, lock: (s: string) => s, unlock: (s: string) => s }), isDev: () => false,
  getStored: () => ({ baseUrl: 'https://api.deepseek.com/', apiFormat: 'auto', model: 'm', thinking: false, homeLanguage: null, rememberChats: true, learn: false }),
  getApiKey: () => 'key'
}))
vi.mock('../store', () => ({ chatStore: () => ({}), pruneOldChats: async () => 0 }))
vi.mock('../files', () => ({ takeFiles: () => [] }))

const { ChatSession } = await import('../llm')
const { liveDeps } = await import('../sessionDeps')

let reply: (signal?: AbortSignal | null) => Promise<Response>
const say = (text: string) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`)
beforeEach(() => {
  reply = async () => say('Done.')
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => reply(init.signal))
})

function rig() {
  const events: ChatEvent[] = []
  const saved = new Map<string, Thread>()
  const deps = {
    ...liveDeps,
    settings: () => ({ ...liveDeps.settings(), rememberChats: true }),
    ledger: () => null,
    pruneChats: async () => 0,
    chats: () => ({ write: async (t: Thread) => void saved.set(t.id, structuredClone(t)), get: async (id: string) => structuredClone(saved.get(id)) ?? null }) as never
  }
  return { session: new ChatSession((e) => events.push(e), {}, deps), events, saved }
}

describe('drafts (D-62)', () => {
  it('keeps each chat’s words apart, brings them back when the chat opens, and lets every window hear them', async () => {
    const { session, events, saved } = rig()
    await session.send('First question', [], null)
    const first = session.threadId
    session.setDraft('half a thought')
    expect(events.at(-1)).toEqual({ type: 'draft', text: 'half a thought' })
    expect(session.draftOf(first)).toBe('half a thought')

    session.reset()
    await session.send('Second question', [], null)
    expect(session.draftOf(session.threadId)).toBeUndefined()
    await vi.waitFor(() => expect(saved.has(first)).toBe(true))
    await session.open(first)
    expect(events.at(-1)).toMatchObject({ type: 'load', draft: 'half a thought' })
  })

  it('forgets the words once they’re sent, and an emptied box keeps nothing', async () => {
    const { session } = rig()
    session.setDraft('   ')
    expect(session.draftOf(session.threadId)).toBeUndefined()
    session.setDraft('Ask this')
    await session.send('Ask this', [], null)
    expect(session.draftOf(session.threadId)).toBeUndefined()
  })
})

describe('how an answer ends (D-62)', () => {
  it('marks an answer the user stopped, and not one a new question replaced', async () => {
    reply = (signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    const { session, events } = rig()
    const first = session.send('Tell me a long story', [], null)
    await vi.waitFor(() => expect(events.some((e) => e.type === 'start')).toBe(true))
    session.stop()
    await first
    expect(events.find((e) => e.type === 'done')).toMatchObject({ stopped: true })

    const second = session.send('Another long one', [], null)
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'start')).toHaveLength(2))
    reply = async () => say('Short.')
    await session.send('Never mind', [], null)
    await second
    expect(events.filter((e) => e.type === 'done').map((e) => 'stopped' in e)).toEqual([true, false, false])
  })

  it('says what kind of failure it was, so the card can offer the right button', async () => {
    reply = async () => new Response('nope', { status: 401 })
    const { session, events } = rig()
    await session.send('Hello', [], null)
    expect(events.find((e) => e.type === 'error')).toMatchObject({ kind: 'key' })
    reply = async () => new Response('prompt is too long', { status: 413 })
    await session.send('Hello again', [], null)
    expect(events.filter((e) => e.type === 'error').at(-1)).toMatchObject({ kind: 'too-long' })
  })
})

// D-40: the lines where Otty hid a key are kept on the Mac, in memory only: never in otty.db, never sent.
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect, it, vi } from 'vitest'
import type { ChatEvent } from '../../shared/types'

vi.mock('electron', () => ({ clipboard: {}, ClipboardItem: class {}, shell: {}, nativeImage: {}, app: { isPackaged: true, getPath: () => '' } }))
vi.mock('../settings', () => ({ getConnections: () => [], saveConnections: () => {}, keychain: () => ({ available: () => false, lock: (s: string) => s, unlock: (s: string) => s }), isDev: () => false,
  getStored: () => ({ baseUrl: 'https://api.deepseek.com/', apiFormat: 'auto', model: 'm', thinking: false, homeLanguage: null, rememberChats: true, learn: false }),
  getApiKey: () => 'key'
}))
vi.mock('../files', () => ({ takeFiles: () => [] }))

const { ChatSession } = await import('../llm')
const { liveDeps } = await import('../sessionDeps')
const { hiddenLines } = await import('../hiddenLines')
const { openDatabase } = await import('../store/db')
const { SqliteChatStore } = await import('../store/sqliteStore')

it('shows which line held a key, and keeps it out of otty.db and the request', async () => {
  const sent: string[] = []
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    sent.push(init.body as string)
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Noted.' } }] })}\n\ndata: [DONE]\n\n`)
  })
  const file = join(mkdtempSync(join(tmpdir(), 'otty-hidden-')), 'otty.db')
  const db = openDatabase(file)
  const store = new SqliteChatStore(db)
  const events: ChatEvent[] = []
  const session = new ChatSession((e) => events.push(e), {}, { ...liveDeps, chats: () => store, pruneChats: async () => 0 })

  await session.send('my key is sk-abcdefghijklmnopWXYZ please keep it', [], null)
  await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true))
  const user = events.find((e) => e.type === 'user')
  expect(user?.type === 'user' && user.hidden).toBe(1)

  expect(hiddenLines(user!.type === 'user' ? user!.id : '')).toEqual(['my key is sk-…WXYZ please keep it'])
  db.exec('pragma wal_checkpoint(truncate)')
  const onDisk = readFileSync(file).toString('utf8') + readFileSync(`${file}-wal`, { flag: 'a+' }).toString('utf8')
  for (const leak of ['abcdefghijklmnop', 'sk-…', 'WXYZ']) {
    expect(onDisk.includes(leak), `otty.db holds “${leak}”`).toBe(false)
    expect(sent.join().includes(leak), `the request holds “${leak}”`).toBe(false)
  }
})

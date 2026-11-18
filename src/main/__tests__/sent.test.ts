import { describe, expect, it, vi } from 'vitest'
import { CHAT_TOOLS } from '../toolSafety'
import { openDatabase } from '../store/db'
import { fold, MemorySentLog, questionWhat, record, setSentLog, SqliteSentLog, type SentRow } from '../sent'

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {}, app: { isPackaged: true } }))
vi.mock('../settings', () => ({ isDev: () => false, getStored: () => ({ baseUrl: 'https://api.openai.com/v1', model: 'm', learn: false }), getApiKey: () => null }))
vi.mock('../pageReader', () => ({ readPageFromMac: async () => 'Config dump: AWS key AKIAABCDEFGHIJKLMNOP and DB_PASSWORD="hunter2222"' }))

const row = (r: Partial<SentRow>): SentRow => ({ at: 1, kind: 'question', service: 'DeepSeek', host: 'api.deepseek.com', local: false, what: '', ...r })

describe('what left the Mac (D-31)', () => {
  it('says what went with a question in names and counts', () => {
    expect(questionWhat({ files: ['Budget.xlsx'], highlights: 2, pictures: 0, hidden: 3 })).toBe('Budget.xlsx · 2 highlights · 3 keys hidden')
    expect(questionWhat({ files: ['a', 'b', 'c', 'd', 'e'], highlights: 0, pictures: 1, hidden: 0 })).toBe('a, b, c and 2 more · 1 picture of the screen')
    expect(questionWhat({ files: [], highlights: 0, pictures: 0, hidden: 0 })).toBe('')
  })

  it('folds one answer’s rounds into a row, but keeps every search and page', () => {
    const rows = [
      { ...row({ at: 5, group: 'a1' }), id: 5 },
      { ...row({ at: 4, kind: 'search', group: 'a1', what: 'otters' }), id: 4 },
      { ...row({ at: 3, kind: 'search', group: 'a1', what: 'rivers' }), id: 3 },
      { ...row({ at: 2, group: 'a1', what: 'notes.txt' }), id: 2 },
      { ...row({ at: 1, group: 'a1' }), id: 1 }
    ]
    expect(fold(rows).map((r) => [r.kind, r.count, r.what])).toEqual([
      ['question', 1, ''],
      ['search', 1, 'otters'],
      ['search', 1, 'rivers'],
      ['question', 2, 'notes.txt']
    ])
  })

  it('keeps rows in otty.db, newest first, and forgets them with their chat', () => {
    const log = new SqliteSentLog(openDatabase(':memory:'))
    log.add(row({ at: 10, chatId: 'c1', group: 'x' }))
    log.add(row({ at: 20, chatId: 'c1', group: 'x' }))
    log.add(row({ at: 30, chatId: 'c2', kind: 'page', service: 'example.com', host: 'example.com', what: 'https://example.com/' }))
    expect(log.list().map((r) => [r.chatId, r.count])).toEqual([
      ['c2', 1],
      ['c1', 2]
    ])
    log.forgetChat('c1')
    expect(log.list()).toHaveLength(1)
    log.prune(31)
    expect(log.list()).toHaveLength(0)
  })

  it('never lets a broken log break an answer', () => {
    setSentLog(() => ({ add: () => { throw new Error('disk full') }, list: () => [], forgetChat: () => {}, clear: () => {}, prune: () => {} }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => record(row({}))).not.toThrow()
    setSentLog(() => null)
  })

  it('lists a page read from the Mac under its own site, and hides keys it holds (D-32)', async () => {
    const log = new MemorySentLog()
    setSentLog(() => log)
    const { runTool } = await import('../tools')
    const out = await runTool('read_page', { url: 'https://paste.example/abc' }, { allowed: CHAT_TOOLS, confirm: async () => true, knownUrl: () => true, sent: { chatId: 'c9', group: 'a9' } })
    expect(out.result).not.toContain('AKIAABCDEFGHIJKLMNOP')
    expect(out.result).not.toContain('hunter2222')
    expect(out.result).toContain('[hidden key]')
    expect(log.list()[0]).toMatchObject({ kind: 'page', service: 'paste.example', host: 'paste.example', chatId: 'c9', what: 'https://paste.example/abc' })
    setSentLog(() => null)
  })

  it('keeps nothing once Remember my chats is off: the in-memory log empties with the chats', () => {
    const log = new MemorySentLog()
    log.add(row({ chatId: 'c1' }))
    log.clear()
    expect(log.list()).toEqual([])
  })
})

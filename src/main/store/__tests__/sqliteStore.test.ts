import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../shared/types'
import { openDatabase, SCHEMA_VERSION } from '../db'
import { importJsonFile } from '../importJson'
import { retentionCutoff } from '../retention'
import { SqliteChatStore } from '../sqliteStore'
import { fixtures, searchContract } from './search.contract'

const tmpDir = () => mkdtempSync(join(tmpdir(), 'otty-db-'))
const memory = () => new SqliteChatStore(openDatabase(':memory:'))
/** The database file plus its write-ahead log: everything SQLite keeps on disk. */
const onDisk = (file: string, word: string) =>
  [file, `${file}-wal`].some((f) => existsSync(f) && readFileSync(f).includes(word))

searchContract('sqlite', async () => memory())

describe('SqliteChatStore', () => {
  it('creates a private, migrated database and survives reopening', async () => {
    const file = join(tmpDir(), 'otty.db')
    const a = new SqliteChatStore(openDatabase(file))
    const saved = fixtures()
    for (const t of saved) await a.write(t)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    const db = openDatabase(file)
    expect(db.prepare('pragma user_version').get()).toEqual({ user_version: SCHEMA_VERSION })
    const b = new SqliteChatStore(db)
    expect((await b.list()).map((c) => c.id)).toEqual(['wifi', 'print', 'otters', 'excel'])
    expect(await b.get('otters')).toEqual(saved.find((t) => t.id === 'otters'))
    expect((await b.search('打印')).map((h) => h.chatId)).toEqual(['print'])
  })

  it('never writes pictures to disk', async () => {
    const file = join(tmpDir(), 'otty.db')
    const store = new SqliteChatStore(openDatabase(file))
    const [t] = fixtures()
    t.messages[0] = {
      ...t.messages[0],
      captures: [{ id: 'a', context: { kind: 'image', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 }, app: null }],
      files: [{ id: 'p', name: 'photo.jpg', kind: 'image', thumb: 'data:image/jpeg;base64,BBBB' }]
    } as never
    t.history = [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }]
    await store.write(t)
    const back = (await store.get(t.id))!
    expect(JSON.stringify(back)).not.toContain('base64')
    expect(JSON.stringify(back)).toContain('photo.jpg')
    expect(readFileSync(file).includes('base64,AAAA')).toBe(false)
  })

  it('writes a turn incrementally: the question first, then only the new rows', async () => {
    const store = memory()
    const [t] = fixtures()
    const question: ChatMessage = { id: 'q', role: 'user', text: 'And with XLOOKUP?', captures: [], app: null }
    const answer: ChatMessage = { id: 'a', role: 'assistant', text: 'XLOOKUP returns a default instead.', tools: [] }
    await store.write(t)

    // As sent: the question is saved before any answer exists.
    t.messages.push(question)
    await store.write(t, { messages: t.messages.length - 1, history: t.history.length })
    expect((await store.get(t.id))!.messages.at(-1)).toEqual(question)

    // The turn ends: the answer and this turn's history, nothing earlier rewritten.
    const turnStart = t.history.length
    t.history.push({ role: 'user', content: 'And with XLOOKUP?' }, { role: 'assistant', content: answer.text })
    const at = t.messages.push(answer) - 1
    await store.write(t, { messages: at, history: turnStart })
    const back = (await store.get(t.id))!
    expect(back.messages.map((m) => m.id).slice(-2)).toEqual(['q', 'a'])
    expect(back.history).toEqual(t.history)
    expect((await store.search('xlookup default')).map((h) => h.chatId)).toEqual([t.id])
  })

  it('a re-write from the start replaces rather than duplicates', async () => {
    const store = memory()
    for (const t of fixtures()) await store.write(t)
    const [t] = fixtures()
    await store.write({ ...t, title: 'Renamed', updatedAt: 9000 })
    expect((await store.list()).map((c) => c.title)[0]).toBe('Renamed')
    expect((await store.get(t.id))!.messages).toHaveLength(t.messages.length)
  })

  it('prunes chats older than the cutoff, and their search rows, leaving nothing on disk', async () => {
    const file = join(tmpDir(), 'otty.db')
    const store = new SqliteChatStore(openDatabase(file))
    for (const t of fixtures()) await store.write(t) // updated at 1000, 2000, 3000, 4000
    expect(onDisk(file, 'raft')).toBe(true) // only in the otters chat
    expect(await store.prune(2500)).toBe(2)
    expect((await store.list()).map((c) => c.id)).toEqual(['wifi', 'print'])
    expect(await store.search('otter')).toEqual([])
    expect(await store.search('打印')).toHaveLength(1)
    expect(onDisk(file, 'raft')).toBe(false)
    expect(await store.prune(2500)).toBe(0)
  })

  it('never prunes a pinned chat', async () => {
    const db = openDatabase(':memory:')
    const store = new SqliteChatStore(db)
    for (const t of fixtures()) await store.write(t)
    db.prepare("update chats set pinned = 1 where id = 'excel'").run()
    expect(await store.prune(10_000)).toBe(3)
    expect((await store.list()).map((c) => c.id)).toEqual(['excel'])
    // A later write (a new turn) keeps the pin.
    await store.write({ ...fixtures()[0], updatedAt: 20_000 })
    expect(db.prepare("select pinned from chats where id = 'excel'").get()).toEqual({ pinned: 1 })
  })

  it('stores when each message was sent, or the chat’s time for older ones', async () => {
    const db = openDatabase(':memory:')
    const store = new SqliteChatStore(db)
    const [t] = fixtures() // updated at 1000, messages without times
    t.messages[1] = { ...t.messages[1], at: 1234 }
    await store.write(t)
    const times = db.prepare("select created_at from messages where chat_id = 'excel' order by seq").all()
    expect(times).toEqual([{ created_at: 1000 }, { created_at: 1234 }])
  })

  it('deleting one chat leaves nothing of it on disk', async () => {
    const file = join(tmpDir(), 'otty.db')
    const store = new SqliteChatStore(openDatabase(file))
    for (const t of fixtures()) await store.write(t)
    await store.delete('otters')
    expect(onDisk(file, 'raft')).toBe(false)
    expect((await store.search('vlookup')).map((h) => h.chatId)).toEqual(['excel'])
  })

  it('forgets everything, leaving no chat text in the file', async () => {
    const file = join(tmpDir(), 'otty.db')
    const store = new SqliteChatStore(openDatabase(file))
    for (const t of fixtures()) await store.write(t)
    expect(onDisk(file, 'VLOOKUP')).toBe(true)
    await store.clear()
    expect(await store.list()).toEqual([])
    expect(onDisk(file, 'VLOOKUP')).toBe(false)
    expect(onDisk(file, 'vlookup')).toBe(false) // the search index's folded copy
    await store.write(fixtures()[0])
    expect((await store.search('vlookup')).map((h) => h.chatId)).toEqual(['excel'])
  })

  it('keeps memories when chats are forgotten, dropping only the link', async () => {
    const db = openDatabase(':memory:')
    const store = new SqliteChatStore(db)
    for (const t of fixtures()) await store.write(t)
    db.prepare(
      "insert into memories(text, origin, source_chat_id, created_at, updated_at) values ('Is learning Spanish', 'told', 'otters', 1, 1)"
    ).run()
    await store.delete('otters')
    expect(db.prepare('select text, source_chat_id from memories').all()).toEqual([{ text: 'Is learning Spanish', source_chat_id: null }])
    await store.clear()
    expect(db.prepare("select text from memories_fts where memories_fts match 'spanish'").all()).toHaveLength(1)
  })
})

describe('schema v1 for what comes next', () => {
  it('forgets intent feedback with its chat, and counts per day without content', async () => {
    const db = openDatabase(':memory:')
    const store = new SqliteChatStore(db)
    for (const t of fixtures()) await store.write(t)
    db.prepare(
      "insert into intent_feedback(chat_id, app, predicted, chosen, model, embedding, created_at) values ('excel', 'Excel', 'explain', 'fix_error', 'minilm+head-1', ?, 1)"
    ).run(new Uint8Array(new Float32Array([0.1, 0.2]).buffer))
    await store.delete('excel')
    expect(db.prepare('select count(*) n from intent_feedback').get()).toEqual({ n: 0 })

    const bump = db.prepare(
      'insert into counters(kind, key, day, count) values (?, ?, ?, 1) on conflict do update set count = count + 1'
    )
    for (const day of [20261103, 20261103, 20261104]) bump.run('app', 'Excel', day)
    expect(db.prepare("select sum(count) n from counters where kind = 'app' and key = 'Excel'").get()).toEqual({ n: 3 })
  })
})

describe('importJsonFile', () => {
  it('imports chats saved by 0.3 (one capture as `context`), then deletes the file', async () => {
    const file = join(tmpDir(), 'chats.json')
    const app = { name: 'Safari', title: 'Pricing' }
    const legacy = {
      id: 'old',
      title: 'Explain this',
      createdAt: 1,
      updatedAt: 1,
      history: [],
      messages: [
        { id: 'u1', role: 'user', text: 'Explain this', context: { kind: 'text', text: 'Annual plans save 20%' }, app },
        { id: 'u2', role: 'user', text: 'And this?', context: null, app: null }
      ]
    }
    writeFileSync(file, JSON.stringify([legacy, ...fixtures()]))
    const store = memory()
    expect(importJsonFile(store, file)).toBe(5)
    expect(existsSync(file)).toBe(false)
    const [first, second] = (await store.get('old'))!.messages
    expect(first).toMatchObject({ app: null, captures: [{ context: { kind: 'text', text: 'Annual plans save 20%' }, app }] })
    expect(first).not.toHaveProperty('context')
    expect(second).toMatchObject({ captures: [], app: null })
    expect((await store.search('annual')).map((h) => h.chatId)).toEqual(['old'])
    expect((await store.list())[0].id).toBe('wifi')
  })

  it('leaves an unreadable file alone, and does nothing without one', () => {
    const dir = tmpDir()
    const file = join(dir, 'chats.json')
    writeFileSync(file, '{not json')
    expect(importJsonFile(memory(), file)).toBe(0)
    expect(existsSync(file)).toBe(true)
    expect(importJsonFile(memory(), join(dir, 'missing.json'))).toBe(0)
  })
})

describe('retentionCutoff', () => {
  it('counts back from now, or keeps everything', () => {
    const now = Date.UTC(2026, 10, 3)
    expect(retentionCutoff('30d', now)).toBe(now - 30 * 86_400_000)
    expect(retentionCutoff('1y', now)).toBe(now - 365 * 86_400_000)
    expect(retentionCutoff('forever', now)).toBeNull()
  })
})

import { mkdtempSync, readFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { openDatabase, SCHEMA_VERSION } from '../db'
import { SqliteChatStore } from '../sqliteStore'
import { fixtures, searchContract } from './search.contract'

const tmpDb = () => join(mkdtempSync(join(tmpdir(), 'otty-db-')), 'otty.db')

searchContract('sqlite', async () => new SqliteChatStore(openDatabase(':memory:')))

describe('SqliteChatStore', () => {
  it('creates a private, migrated database and survives reopening', async () => {
    const file = tmpDb()
    const a = new SqliteChatStore(openDatabase(file))
    const saved = fixtures()
    for (const t of saved) await a.save(t)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    const db = openDatabase(file)
    expect(db.prepare('pragma user_version').get()).toEqual({ user_version: SCHEMA_VERSION })
    const b = new SqliteChatStore(db)
    expect((await b.list()).map((c) => c.id)).toEqual(['wifi', 'print', 'otters', 'excel'])
    expect(await b.get('otters')).toEqual(saved.find((t) => t.id === 'otters'))
    expect((await b.search('打印')).map((h) => h.chatId)).toEqual(['print'])
  })

  it('never writes pictures to disk', async () => {
    const file = tmpDb()
    const store = new SqliteChatStore(openDatabase(file))
    const [t] = fixtures()
    t.messages[0] = {
      ...t.messages[0],
      captures: [{ id: 'a', context: { kind: 'image', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 }, app: null }]
    } as never
    t.history = [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }]
    await store.save(t)
    const raw = openDatabase(file).prepare("select group_concat(json) j from (select json from messages union all select json from llm_history)").get() as { j: string }
    expect(raw.j).not.toContain('base64')
    expect(readFileSync(file).includes('base64,AAAA')).toBe(false)
  })

  it('imports JSON chats keeping their order, and a re-save replaces rather than duplicates', async () => {
    const store = new SqliteChatStore(openDatabase(':memory:'))
    expect(await store.importThreads(fixtures().reverse())).toBe(4)
    const [t] = fixtures()
    await store.save({ ...t, title: 'Renamed', updatedAt: 9000 })
    expect((await store.list()).map((c) => c.title)).toEqual(['Renamed', 'My Wi-Fi keeps dropping', '點樣 save 做 PDF？', 'Do otters hold hands?'])
    expect((await store.get(t.id))!.messages).toHaveLength(t.messages.length)
  })

  it('keeps memories when chats are forgotten, dropping only the link', async () => {
    const db = openDatabase(':memory:')
    const store = new SqliteChatStore(db)
    for (const t of fixtures()) await store.save(t)
    db.prepare(
      "insert into memories(text, origin, source_chat_id, created_at, updated_at) values ('Is learning Spanish', 'told', 'otters', 1, 1)"
    ).run()
    await store.delete('otters')
    expect(db.prepare('select text, source_chat_id from memories').all()).toEqual([
      { text: 'Is learning Spanish', source_chat_id: null }
    ])
    await store.clear()
    expect(db.prepare("select text from memories_fts where memories_fts match 'spanish'").all()).toHaveLength(1)
    expect(await store.list()).toEqual([])
  })
})

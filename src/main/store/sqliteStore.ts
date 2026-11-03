import type { DatabaseSync } from 'node:sqlite'
import type { ChatMessage, ChatSearchHit, ChatSummary } from '../../shared/types'
import type { Message } from '../llm'
import { transaction } from './db'
import { withoutImages } from './jsonStore'
import { parseQuery, searchableText, searchThreads } from './search'
import type { ChatStore, Thread } from './types'
import { upgradeThread } from './upgrade'

// Saved chats in SQLite (D-3). Same contract as the JSON store; see `db.ts` for the schema.

/** FTS5 trigram only indexes terms of 3+ characters (code points); shorter ones use instr() instead. */
const TRIGRAM = 3

interface ChatRow {
  id: string
  title: string
  app: string | null
  created_at: number
  updated_at: number
}

export class SqliteChatStore implements ChatStore {
  constructor(private db: DatabaseSync) {}

  async list(opts?: { limit?: number }): Promise<ChatSummary[]> {
    const rows = this.db
      .prepare('select id, title, app, updated_at from chats order by updated_at desc limit ?')
      .all(opts?.limit ?? -1) as unknown as ChatRow[]
    return rows.map((r) => ({ id: r.id, title: r.title, ...(r.app ? { app: r.app } : {}), updatedAt: r.updated_at }))
  }

  async get(id: string): Promise<Thread | undefined> {
    return this.read(id)
  }

  /** Replaces the chat's rows in one transaction. Incremental writes (D-3's `appendMessage`) can come later. */
  async save(t: Thread): Promise<void> {
    if (!t.messages.length) return
    const clean = withoutImages(t)
    transaction(this.db, () => {
      this.db
        .prepare(
          `insert into chats(id, title, app, created_at, updated_at) values (?, ?, ?, ?, ?)
           on conflict(id) do update set title = excluded.title, app = excluded.app, updated_at = excluded.updated_at`
        )
        .run(t.id, t.title, t.app ?? null, t.createdAt, t.updatedAt)
      this.db.prepare('delete from messages where chat_id = ?').run(t.id)
      this.db.prepare('delete from llm_history where chat_id = ?').run(t.id)
      this.db.prepare('delete from chat_search where chat_id = ?').run(t.id)
      const message = this.db.prepare('insert into messages(chat_id, seq, id, role, json) values (?, ?, ?, ?, ?)')
      clean.messages.forEach((m, i) => message.run(t.id, i, m.id, m.role, JSON.stringify(m)))
      const history = this.db.prepare('insert into llm_history(chat_id, seq, json) values (?, ?, ?)')
      clean.history.forEach((m, i) => history.run(t.id, i, JSON.stringify(m)))
      this.db.prepare('insert into chat_search(chat_id, text) values (?, ?)').run(t.id, searchableText(clean))
    })
  }

  async delete(id: string): Promise<void> {
    transaction(this.db, () => {
      this.db.prepare('delete from chats where id = ?').run(id)
      this.db.prepare('delete from chat_search where chat_id = ?').run(id)
    })
  }

  /** Forgets every chat and compacts the file, so deleted text doesn't linger on disk. Memories stay. */
  async clear(): Promise<void> {
    transaction(this.db, () => {
      this.db.exec('delete from chats; delete from chat_search;')
    })
    this.db.exec('vacuum')
  }

  async search(q: string, opts?: { limit?: number }): Promise<ChatSearchHit[]> {
    const terms = parseQuery(q)
    if (!terms.length) return []
    // Narrow with the index, then rank the candidates with the shared rules.
    const where: string[] = []
    const args: string[] = []
    for (const term of terms) {
      if ([...term].length >= TRIGRAM) {
        where.push('chat_search match ?')
        args.push(`text : "${term.replace(/"/g, '""')}"`)
      } else {
        where.push('instr(text, ?) > 0')
        args.push(term)
      }
    }
    const ids = this.db
      .prepare(`select chat_id from chat_search where ${where.join(' and ')}`)
      .all(...args) as unknown as { chat_id: string }[]
    const threads = ids.flatMap(({ chat_id }) => this.read(chat_id) ?? [])
    return searchThreads(threads, q, opts)
  }

  /**
   * Copies the chats from the JSON store (oldest first, so `updated_at` order is kept) in one transaction.
   * The caller renames `chats.json` afterwards, so this runs once.
   */
  async importThreads(threads: Thread[]): Promise<number> {
    const sorted = [...threads].sort((a, b) => a.updatedAt - b.updatedAt)
    for (const t of sorted) await this.save(t)
    return sorted.length
  }

  private read(id: string): Thread | undefined {
    const chat = this.db.prepare('select * from chats where id = ?').get(id) as ChatRow | undefined
    if (!chat) return undefined
    const messages = this.db
      .prepare('select json from messages where chat_id = ? order by seq')
      .all(id) as unknown as { json: string }[]
    const history = this.db
      .prepare('select json from llm_history where chat_id = ? order by seq')
      .all(id) as unknown as { json: string }[]
    return upgradeThread({
      id: chat.id,
      title: chat.title,
      ...(chat.app ? { app: chat.app } : {}),
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      messages: messages.map((m) => JSON.parse(m.json) as ChatMessage),
      history: history.map((m) => JSON.parse(m.json) as Message)
    })
  }
}

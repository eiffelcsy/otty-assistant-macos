import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type { ChatMessage, ChatSearchHit, ChatSummary } from '../../shared/types'
import type { Message } from '../llm'
import { CHAT_SEARCH_DDL, compact, transaction } from './db'
import { stripHistory, stripMessage } from './images'
import { parseQuery, searchableText, searchThreads } from './search'
import type { ChatStore, Thread, WriteFrom } from './types'
import { upgradeThread } from './upgrade'

// Saved chats in SQLite (D-3). See `db.ts` for the schema. Every call is synchronous and sub-millisecond for
// a normal chat, so it runs on main; statements are prepared once.

/** FTS5 trigram only indexes terms of 3+ characters (code points); shorter ones use instr() instead. */
const TRIGRAM = 3
/**
 * Search ranks the newest matching chats, at most this many. A common word in years of chats would otherwise
 * load every one of them to rank; past this many, the older matches are rarely the one being looked for.
 */
const MAX_CANDIDATES = 200

interface ChatRow {
  id: string
  title: string
  app: string | null
  created_at: number
  updated_at: number
}

export class SqliteChatStore implements ChatStore {
  private q: Record<
    | 'upsertChat'
    | 'clearMessagesFrom'
    | 'insertMessage'
    | 'clearHistoryFrom'
    | 'insertHistory'
    | 'clearSearch'
    | 'insertSearch'
    | 'getChat'
    | 'getMessages'
    | 'getHistory'
    | 'list'
    | 'deleteChat'
    | 'pruneChats',
    StatementSync
  >

  constructor(private db: DatabaseSync) {
    const p = (sql: string) => db.prepare(sql)
    this.q = {
      upsertChat: p(
        `insert into chats(id, title, app, created_at, updated_at) values (?, ?, ?, ?, ?)
         on conflict(id) do update set title = excluded.title, app = excluded.app, updated_at = excluded.updated_at
         returning num`
      ),
      clearMessagesFrom: p('delete from messages where chat_id = ? and seq >= ?'),
      insertMessage: p('insert into messages(chat_id, seq, id, role, json, created_at) values (?, ?, ?, ?, ?, ?)'),
      clearHistoryFrom: p('delete from llm_history where chat_id = ? and seq >= ?'),
      insertHistory: p('insert into llm_history(chat_id, seq, json) values (?, ?, ?)'),
      clearSearch: p('delete from chat_search where rowid = ?'),
      insertSearch: p('insert into chat_search(rowid, text) values (?, ?)'),
      getChat: p('select * from chats where id = ?'),
      getMessages: p('select json from messages where chat_id = ? order by seq'),
      getHistory: p('select json from llm_history where chat_id = ? order by seq'),
      list: p('select id, title, app, updated_at from chats order by updated_at desc limit ?'),
      deleteChat: p('delete from chats where id = ? returning num'),
      // Pinned chats stay whatever their age.
      pruneChats: p('delete from chats where updated_at < ? and pinned = 0 returning num')
    }
  }

  async list(opts?: { limit?: number }): Promise<ChatSummary[]> {
    const rows = this.q.list.all(opts?.limit ?? -1) as unknown as ChatRow[]
    return rows.map((r) => ({ id: r.id, title: r.title, ...(r.app ? { app: r.app } : {}), updatedAt: r.updated_at }))
  }

  async get(id: string): Promise<Thread | undefined> {
    return this.read(id)
  }

  async write(t: Thread, from: WriteFrom = { messages: 0, history: 0 }): Promise<void> {
    if (!t.messages.length) return
    transaction(this.db, () => this.writeRows(t, from))
  }

  async delete(id: string): Promise<void> {
    transaction(this.db, () =>
      this.forgetting(() => {
        const gone = this.q.deleteChat.get(id) as { num: number } | undefined
        if (gone) this.q.clearSearch.run(gone.num)
      })
    )
    compact(this.db)
  }

  /** Forgets every chat. Memories stay: forgetting them is its own action. */
  async clear(): Promise<void> {
    // Dropping the index frees all its pages at once (zeroed by secure_delete), whatever its size.
    transaction(this.db, () => this.db.exec(`delete from chats; drop table chat_search; ${CHAT_SEARCH_DDL};`))
    compact(this.db)
  }

  async prune(cutoff: number): Promise<number> {
    const gone = transaction(this.db, () =>
      this.forgetting(() => {
        const rows = this.q.pruneChats.all(cutoff) as unknown as { num: number }[]
        for (const { num } of rows) this.q.clearSearch.run(num)
        return rows.length
      })
    )
    if (gone) compact(this.db)
    return gone
  }

  /**
   * Runs `fn` with FTS5's secure-delete on, so the index entries of a forgotten chat are overwritten, not just
   * marked deleted. It's off otherwise: replacing a chat's own row on every turn has nothing to hide, and
   * secure-delete would add about 4 ms to each save.
   */
  private forgetting<T>(fn: () => T): T {
    this.db.exec("insert into chat_search(chat_search, rank) values ('secure-delete', 1)")
    try {
      return fn()
    } finally {
      this.db.exec("insert into chat_search(chat_search, rank) values ('secure-delete', 0)")
    }
  }

  async search(q: string, opts?: { limit?: number }): Promise<ChatSearchHit[]> {
    const terms = parseQuery(q)
    if (!terms.length) return []
    // Narrow with the index, newest first, then rank the candidates with the shared rules.
    const where: string[] = []
    const args: (string | number)[] = []
    for (const term of terms) {
      if ([...term].length >= TRIGRAM) {
        where.push('chat_search match ?')
        args.push(`text : "${term.replace(/"/g, '""')}"`)
      } else {
        where.push('instr(chat_search.text, ?) > 0')
        args.push(term)
      }
    }
    const ids = this.db
      .prepare(
        `select chats.id from chat_search join chats on chats.num = chat_search.rowid
         where ${where.join(' and ')} order by chats.updated_at desc limit ${MAX_CANDIDATES}`
      )
      .all(...args) as unknown as { id: string }[]
    const threads = ids.flatMap(({ id }) => this.read(id) ?? [])
    return searchThreads(threads, q, opts)
  }

  /** Copies chats saved by an older Otty in one transaction: all of them or, on any error, none. */
  importThreads(threads: Thread[]): number {
    const kept = threads.filter((t) => t.messages.length)
    transaction(this.db, () => {
      for (const t of kept) this.writeRows(t, { messages: 0, history: 0 })
    })
    return kept.length
  }

  private writeRows(t: Thread, from: WriteFrom): void {
    const { num } = this.q.upsertChat.get(t.id, t.title, t.app ?? null, t.createdAt, t.updatedAt) as { num: number }
    this.q.clearMessagesFrom.run(t.id, from.messages)
    for (let i = from.messages; i < t.messages.length; i++) {
      const m = stripMessage(t.messages[i])
      // Chats saved before messages had times get the chat's own time.
      this.q.insertMessage.run(t.id, i, m.id, m.role, JSON.stringify(m), m.at ?? t.updatedAt)
    }
    this.q.clearHistoryFrom.run(t.id, from.history)
    for (let i = from.history; i < t.history.length; i++) {
      this.q.insertHistory.run(t.id, i, JSON.stringify(stripHistory(t.history[i])))
    }
    // The search row covers the whole chat, found by rowid, so replacing it doesn't depend on how many chats there are.
    this.q.clearSearch.run(num)
    this.q.insertSearch.run(num, searchableText(t))
  }

  private read(id: string): Thread | undefined {
    const chat = this.q.getChat.get(id) as ChatRow | undefined
    if (!chat) return undefined
    const messages = this.q.getMessages.all(id) as unknown as { json: string }[]
    const history = this.q.getHistory.all(id) as unknown as { json: string }[]
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

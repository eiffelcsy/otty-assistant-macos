import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { fold } from '../../shared/match'
import type { Memory, MemoryKind, MemoryOrigin } from '../../shared/types'
import { compact, transaction } from '../store/db'

// What Otty knows about the user (D-10). The list is small, so matching happens here rather than in `memories_fts`,
// which can't do words under three characters. That's what lets Chinese and short app names match.

/** About this much goes with each question. */
const PROMPT_BUDGET = 1_500
/** Inferences below this are only sent when they match the question. */
const SURE = 0.6
/** How alike two memories must be to count as the same thing. */
const SIMILAR = 0.6
export const MAX_MEMORY_LENGTH = 200

/** Starts the note, so an earlier one can be found in the history. */
export const MEMORY_NOTE = '[What you know about the user'

export interface NewMemory {
  text: string
  kind?: MemoryKind
  origin: MemoryOrigin
  confidence?: number
  sourceChatId?: string
  sourceMessageId?: string
  expiresAt?: number
  habit?: string
}

interface Row {
  id: number
  text: string
  kind: MemoryKind
  origin: MemoryOrigin
  status: Memory['status']
  confidence: number
  source_chat_id: string | null
  created_at: number
  updated_at: number
  expires_at: number | null
  use_count: number
  last_used_at: number | null
  habit: string | null
}

const toMemory = (r: Row): Memory => ({
  id: r.id,
  text: r.text,
  kind: r.kind,
  origin: r.origin,
  status: r.status,
  confidence: r.confidence,
  ...(r.source_chat_id ? { sourceChatId: r.source_chat_id } : {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.expires_at ? { expiresAt: r.expires_at } : {})
})

/** Words of three or more letters, and each Chinese character pair, for "does this memory match the question?". */
function terms(text: string): string[] {
  return (fold(text).match(/[\p{L}\p{N}]+/gu) ?? []).flatMap((word) => {
    if (!/\p{Script=Han}/u.test(word)) return word.length >= 3 ? [word] : []
    const chars = [...word]
    return chars.slice(0, -1).map((c, i) => c + chars[i + 1])
  })
}

function trigrams(text: string): Set<string> {
  const chars = [...fold(text).replace(/\s+/g, ' ').trim()]
  const out = new Set<string>()
  for (let i = 0; i + 2 < chars.length; i++) out.add(chars[i] + chars[i + 1] + chars[i + 2])
  return out
}

function likeness(a: string, b: string): number {
  const [x, y] = [trigrams(a), trigrams(b)]
  if (!x.size || !y.size) return fold(a) === fold(b) ? 1 : 0
  const shared = [...x].filter((t) => y.has(t)).length
  return shared / (x.size + y.size - shared)
}

/** One line, as short as it needs to be, so a memory can't reshape the note it's sent in. */
export function cleanMemory(text: string): string {
  return text.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_LENGTH)
}

export class MemoryStore {
  private q: Record<'list' | 'get' | 'insert' | 'remove' | 'expire' | 'used' | 'chatExists' | 'byHabit' | 'optOut' | 'optedOut' | 'count' | 'counts', StatementSync>

  constructor(private db: DatabaseSync) {
    const p = (sql: string) => db.prepare(sql)
    this.q = {
      list: p("select * from memories where status != 'pending' and (expires_at is null or expires_at > ?) order by updated_at desc, id desc"),
      get: p('select * from memories where id = ?'),
      insert: p(
        `insert into memories(text, kind, origin, confidence, source_chat_id, source_message_id, created_at, updated_at, expires_at, habit)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning *`
      ),
      remove: p('delete from memories where id = ? returning habit'),
      expire: p('delete from memories where expires_at is not null and expires_at <= ?'),
      used: p('update memories set use_count = use_count + 1, last_used_at = ? where id = ?'),
      chatExists: p('select 1 from chats where id = ?'),
      byHabit: p('select * from memories where habit = ?'),
      optOut: p('insert or ignore into memory_optouts(key, created_at) values (?, ?)'),
      optedOut: p('select 1 from memory_optouts where key = ?'),
      count: p('insert into counters(kind, key, day, count) values (?, ?, ?, 1) on conflict do update set count = count + 1'),
      counts: p('select kind, key, day, count from counters where day >= ?')
    }
  }

  private rows(now: number): Row[] {
    return this.q.list.all(now) as unknown as Row[]
  }

  /** Everything Otty knows, newest first. */
  list(now = Date.now()): Memory[] {
    return this.rows(now).map(toMemory)
  }

  get(id: number): Memory | undefined {
    const row = this.q.get.get(id) as Row | undefined
    return row && toMemory(row)
  }

  add(m: NewMemory, now = Date.now()): Memory {
    // The chat may not be saved: "Remember my chats" can be off, and a memory outlives its chat anyway.
    const chat = m.sourceChatId && this.q.chatExists.get(m.sourceChatId) ? m.sourceChatId : null
    const row = this.q.insert.get(
      cleanMemory(m.text),
      m.kind ?? 'about',
      m.origin,
      m.confidence ?? 1,
      chat,
      chat ? (m.sourceMessageId ?? null) : null,
      now,
      now,
      m.expiresAt ?? null,
      m.habit ?? null
    ) as unknown as Row
    return toMemory(row)
  }

  update(id: number, change: { text?: string; status?: Memory['status']; confidence?: number; origin?: MemoryOrigin; expiresAt?: number }, now = Date.now()): Memory | undefined {
    const sets: string[] = ['updated_at = ?']
    const args: (string | number)[] = [now]
    if (change.text !== undefined) (sets.push('text = ?'), args.push(cleanMemory(change.text)))
    if (change.status !== undefined) (sets.push('status = ?'), args.push(change.status))
    if (change.confidence !== undefined) (sets.push('confidence = ?'), args.push(change.confidence))
    if (change.origin !== undefined) (sets.push('origin = ?'), args.push(change.origin))
    if (change.expiresAt !== undefined) (sets.push('expires_at = ?'), args.push(change.expiresAt))
    this.db.prepare(`update memories set ${sets.join(', ')} where id = ?`).run(...args, id)
    return this.get(id)
  }

  /** Forgets one. A habit stays forgotten: without this, the same counts would write it back. */
  remove(id: number, now = Date.now()): void {
    const gone = this.q.remove.get(id) as { habit: string | null } | undefined
    if (gone?.habit) this.q.optOut.run(gone.habit, now)
    compact(this.db)
  }

  /** "Forget everything Otty knows": memories, the counts behind habits, and which habits were turned down. */
  clear(): void {
    transaction(this.db, () => this.db.exec('delete from memories; delete from counters; delete from memory_optouts;'))
    compact(this.db)
  }

  /** Short-lived facts, once their time has passed. */
  pruneExpired(now = Date.now()): void {
    if (Number(this.q.expire.run(now).changes)) compact(this.db)
  }

  /** The closest memory saying the same thing, if there is one. */
  findSimilar(text: string, now = Date.now()): Memory | undefined {
    let best: Row | undefined
    let score = SIMILAR
    for (const row of this.rows(now)) {
      const s = likeness(text, row.text)
      if (s >= score) [best, score] = [row, s]
    }
    return best && toMemory(best)
  }

  /**
   * The note sent with a question. Told and typed memories go first, then what matches the question or app, then the
   * most used. It goes at the end of that turn's message, because it changes per question and the system prompt can't.
   */
  forPrompt(question: string, app: string | null, now = Date.now()): { note: string; ids: number[]; matched: { id: number; text: string }[] } {
    const wanted = new Set([...terms(question), ...terms(app ?? '')])
    const matches = (r: Row) => terms(r.text).some((t) => wanted.has(t))
    const rank = (r: Row) => (r.origin === 'told' || r.origin === 'settings' ? 0 : matches(r) ? 1 : 2)
    const picked = this.rows(now)
      .filter((r) => r.status === 'active' && (r.confidence >= SURE || matches(r)))
      .sort((a, b) => rank(a) - rank(b) || b.use_count - a.use_count || b.updated_at - a.updated_at)

    const lines: string[] = []
    const ids: number[] = []
    // Only a memory that matched the question or the app counts as having shaped the answer (D-24). Being sent proves nothing.
    const matched: { id: number; text: string }[] = []
    let used = 0
    for (const r of picked) {
      const line = `- #${r.id} ${r.text}`
      if (used + line.length > PROMPT_BUDGET) break
      used += line.length
      lines.push(line)
      ids.push(r.id)
      if (matches(r)) matched.push({ id: r.id, text: r.text })
    }
    return { note: lines.length ? `${MEMORY_NOTE}:\n${lines.join('\n')}]` : '', ids, matched }
  }

  /** Marks memories as sent, so the most useful ones win when there are too many. */
  markUsed(ids: number[], now = Date.now()): void {
    for (const id of ids) this.q.used.run(now, id)
  }

  /** Adds to a local count: never content. */
  count(kind: string, key: string, day: number): void {
    this.q.count.run(kind, key, day)
  }

  counts(sinceDay: number): { kind: string; key: string; day: number; count: number }[] {
    return this.q.counts.all(sinceDay) as unknown as { kind: string; key: string; day: number; count: number }[]
  }

  /** Writes or refreshes a habit. Null when nothing the user should hear about changed. */
  saveHabit(key: string, text: string, kind: MemoryKind, now = Date.now()): Memory | null {
    if (this.q.optedOut.get(key)) return null
    const had = this.q.byHabit.get(key) as Row | undefined
    if (!had) return this.add({ text, kind, origin: 'observed', habit: key }, now)
    if (had.text !== text) this.update(had.id, { text }, now)
    return null
  }
}

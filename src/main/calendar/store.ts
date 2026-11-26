import type { DatabaseSync } from 'node:sqlite'

// D-73: Otty's own events. In `otty.db` (kept whatever "Remember my chats" says), or in memory when the database
// can't be opened. No electron here, so it's tested on its own.

export interface StoredEvent {
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  notes?: string
  madeBy: 'you' | 'otty'
  chatId?: string
  answerId?: string
  created: number
  updated: number
}

export interface EventStore {
  /** Events overlapping [from, to): start < to and end > from, soonest first. */
  range(from: number, to: number): StoredEvent[]
  get(id: string): StoredEvent | undefined
  /** Inserts, or replaces the event with the same id. */
  save(e: StoredEvent): void
  remove(id: string): boolean
}

interface Row {
  id: string
  title: string
  start: number
  end: number
  all_day: number
  notes: string | null
  made_by: string
  chat_id: string | null
  answer_id: string | null
  created: number
  updated: number
}

const fromRow = (r: Row): StoredEvent => ({
  id: r.id,
  title: r.title,
  start: r.start,
  end: r.end,
  allDay: r.all_day === 1,
  ...(r.notes !== null ? { notes: r.notes } : {}),
  madeBy: r.made_by === 'otty' ? 'otty' : 'you',
  ...(r.chat_id !== null ? { chatId: r.chat_id } : {}),
  ...(r.answer_id !== null ? { answerId: r.answer_id } : {}),
  created: r.created,
  updated: r.updated
})

export class SqliteEventStore implements EventStore {
  constructor(private db: DatabaseSync) {}

  range(from: number, to: number): StoredEvent[] {
    return (this.db.prepare('select * from events where start < ? and "end" > ? order by start, title').all(to, from) as unknown as Row[]).map(fromRow)
  }

  get(id: string): StoredEvent | undefined {
    const row = this.db.prepare('select * from events where id = ?').get(id) as unknown as Row | undefined
    return row ? fromRow(row) : undefined
  }

  save(e: StoredEvent): void {
    this.db
      .prepare('insert or replace into events(id, title, start, "end", all_day, notes, made_by, chat_id, answer_id, created, updated) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.id, e.title, e.start, e.end, e.allDay ? 1 : 0, e.notes ?? null, e.madeBy, e.chatId ?? null, e.answerId ?? null, e.created, e.updated)
  }

  remove(id: string): boolean {
    return Number(this.db.prepare('delete from events where id = ?').run(id).changes) > 0
  }
}

/** With the database closed: kept while Otty runs. */
export class MemoryEventStore implements EventStore {
  private rows = new Map<string, StoredEvent>()

  range(from: number, to: number): StoredEvent[] {
    return [...this.rows.values()].filter((e) => e.start < to && e.end > from).sort((a, b) => a.start - b.start || a.title.localeCompare(b.title))
  }

  get(id: string): StoredEvent | undefined {
    return this.rows.get(id)
  }

  save(e: StoredEvent): void {
    this.rows.set(e.id, { ...e })
  }

  remove(id: string): boolean {
    return this.rows.delete(id)
  }
}

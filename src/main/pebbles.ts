import type { DatabaseSync } from 'node:sqlite'
import type { KeptPebble, PebbleKind } from '../shared/pebbles'
import type { DrawingKind } from '../shared/drawing'
import type { PouchItem } from '../shared/types'

// Kept Pebbles, the Pouch (D-77). Kept means kept: a Pebble outlives its chat (`chatGone`), and only "Forget my
// Pouch" empties it. `MemoryPebbles` is the fallback when the database fails.

export interface PebbleStore {
  keep(p: KeptPebble): void
  drop(answerId: string, index: number): void
  /** The kept indexes of one answer's Pebbles. */
  keptIn(answerId: string): number[]
  get(answerId: string, index: number): KeptPebble | undefined
  /** Every kept Pebble, newest kept first. */
  all(): KeptPebble[]
  /** null takes it off its shelf. */
  setShelf(answerId: string, index: number, shelf: string | null): void
  /** The chat was deleted: its Pebbles stay, named after it. */
  chatGone(chatId: string): void
  clear(): void
  count(): number
}

interface Row {
  chat_id: string
  answer_id: string
  idx: number
  kind: string
  title: string
  drawing: string
  code: string
  kept: number
  chat_title: string | null
  chat_at: number | null
  shelf: string | null
  chat_gone: number
}

const fromRow = (r: Row): KeptPebble => ({
  chatId: r.chat_id,
  answerId: r.answer_id,
  index: r.idx,
  kind: r.kind as PebbleKind,
  title: r.title,
  drawing: r.drawing as DrawingKind,
  code: r.code,
  kept: r.kept,
  chatTitle: r.chat_title ?? undefined,
  chatAt: r.chat_at ?? undefined,
  shelf: r.shelf ?? undefined,
  chatGone: r.chat_gone === 1
})

export class SqlitePebbles implements PebbleStore {
  constructor(private db: DatabaseSync) {}

  keep(p: KeptPebble): void {
    // A re-keep updates the Pebble but keeps its shelf, so only a fresh keep (or an undo) sets one.
    this.db
      .prepare(
        `insert into pebbles(chat_id, answer_id, idx, kind, title, drawing, code, kept, chat_title, chat_at, shelf, chat_gone) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(answer_id, idx) do update set kind = excluded.kind, title = excluded.title, drawing = excluded.drawing, code = excluded.code, kept = excluded.kept`
      )
      .run(p.chatId, p.answerId, p.index, p.kind, p.title, p.drawing, p.code, p.kept, p.chatTitle ?? null, p.chatAt ?? null, p.shelf ?? null, p.chatGone ? 1 : 0)
  }

  drop(answerId: string, index: number): void {
    this.db.prepare('delete from pebbles where answer_id = ? and idx = ?').run(answerId, index)
  }

  keptIn(answerId: string): number[] {
    return (this.db.prepare('select idx from pebbles where answer_id = ? order by idx').all(answerId) as { idx: number }[]).map((r) => r.idx)
  }

  get(answerId: string, index: number): KeptPebble | undefined {
    const row = this.db.prepare('select * from pebbles where answer_id = ? and idx = ?').get(answerId, index) as Row | undefined
    return row && fromRow(row)
  }

  all(): KeptPebble[] {
    return (this.db.prepare('select * from pebbles order by kept desc').all() as unknown as Row[]).map(fromRow)
  }

  setShelf(answerId: string, index: number, shelf: string | null): void {
    this.db.prepare('update pebbles set shelf = ? where answer_id = ? and idx = ?').run(shelf, answerId, index)
  }

  chatGone(chatId: string): void {
    this.db.prepare('update pebbles set chat_gone = 1 where chat_id = ?').run(chatId)
  }

  clear(): void {
    this.db.exec('delete from pebbles')
  }

  count(): number {
    return (this.db.prepare('select count(*) as n from pebbles').get() as { n: number }).n
  }
}

/** With the database unavailable: kept while Otty runs. */
export class MemoryPebbles implements PebbleStore {
  private rows: KeptPebble[] = []

  keep(p: KeptPebble): void {
    const shelf = this.get(p.answerId, p.index)?.shelf ?? p.shelf
    this.drop(p.answerId, p.index)
    this.rows.push({ ...p, shelf })
  }

  drop(answerId: string, index: number): void {
    this.rows = this.rows.filter((r) => !(r.answerId === answerId && r.index === index))
  }

  keptIn(answerId: string): number[] {
    return this.rows.filter((r) => r.answerId === answerId).map((r) => r.index).sort((a, b) => a - b)
  }

  get(answerId: string, index: number): KeptPebble | undefined {
    return this.rows.find((r) => r.answerId === answerId && r.index === index)
  }

  all(): KeptPebble[] {
    return [...this.rows].sort((a, b) => b.kept - a.kept)
  }

  setShelf(answerId: string, index: number, shelf: string | null): void {
    const row = this.get(answerId, index)
    if (row) row.shelf = shelf ?? undefined
  }

  chatGone(chatId: string): void {
    for (const r of this.rows) if (r.chatId === chatId) r.chatGone = true
  }

  clear(): void {
    this.rows = []
  }

  count(): number {
    return this.rows.length
  }
}

/** What the Pouch shows, one line per kept Pebble. The one read-only query, so later features share it. */
export function pouchItems(store: PebbleStore): PouchItem[] {
  return store.all().map((p) => ({
    answerId: p.answerId,
    index: p.index,
    kind: p.kind,
    title: p.title,
    drawing: p.drawing,
    code: p.code,
    ...(p.shelf !== undefined ? { shelf: p.shelf } : {}),
    ...(p.chatGone ? {} : { chatId: p.chatId }),
    chatTitle: p.chatTitle || 'A chat',
    chatAt: p.chatAt ?? p.kept,
    kept: p.kept
  }))
}

// Put back: the row leaves the Pouch, and main keeps it 30 s so Undo can bring it back.
const UNDO_MS = 30_000
const dropped = new Map<string, { row: KeptPebble; timer: ReturnType<typeof setTimeout> }>()
const slot = (answerId: string, index: number) => `${answerId}\u0000${index}`

export function putBack(store: PebbleStore, answerId: string, index: number): boolean {
  const row = store.get(answerId, index)
  if (!row) return false
  store.drop(answerId, index)
  const key = slot(answerId, index)
  clearTimeout(dropped.get(key)?.timer)
  const timer = setTimeout(() => dropped.delete(key), UNDO_MS)
  timer.unref()
  dropped.set(key, { row, timer })
  return true
}

export function undoPutBack(store: PebbleStore, answerId: string, index: number): boolean {
  const key = slot(answerId, index)
  const found = dropped.get(key)
  if (!found) return false
  clearTimeout(found.timer)
  dropped.delete(key)
  store.keep(found.row)
  return true
}

/** A shelf name: 1 to 40 characters once trimmed, or null for "Not on a shelf". Anything else is refused (undefined). */
export function cleanShelf(x: unknown): string | null | undefined {
  if (x === null) return null
  if (typeof x !== 'string') return undefined
  const name = x.trim()
  return name.length >= 1 && name.length <= 40 ? name : undefined
}

import type { DatabaseSync } from 'node:sqlite'
import type { SentItem, SentKind } from '../shared/types'

// What left the Mac (D-31): one row for every request to the model, every search and every page read, with where it
// went and why, in words built here from counts and names. Never the text that was sent: the chat already has that.
// Callers record through `record`, which does nothing until main plugs in a log, so tests never need a database.

/** Why a request is being made. Every request to the model carries one: `activeProvider` won't build without it. */
export interface SentTag {
  kind: Exclude<SentKind, 'search' | 'page'>
  chatId?: string
  /** Requests that belong together, such as one answer's rounds or one job, show as one row. */
  group?: string
  what?: string
}

export interface SentRow {
  at: number
  kind: SentKind
  service: string
  host: string
  local: boolean
  chatId?: string
  group?: string
  what: string
}

export interface SentLog {
  add(row: SentRow): void
  /** Newest first, with a group's rows folded into one. */
  list(limit?: number): SentItem[]
  forgetChat(id: string): void
  clear(): void
  /** Forgets rows before `cutoff`, with the chats of the same age. */
  prune(cutoff: number): void
}

let log: () => SentLog | null = () => null

let heard: () => void = () => {}

export function setSentLog(get: () => SentLog | null, onRecord: () => void = () => {}): void {
  log = get
  heard = onRecord
}

/** Never throws: the record must never be the reason an answer fails. */
export function record(row: Omit<SentRow, 'at'> & { at?: number }): void {
  try {
    log()?.add({ ...row, at: row.at ?? Date.now(), what: row.what.slice(0, 300) })
    heard()
  } catch (err) {
    console.error('Could not note what left the Mac', err)
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** "Budget.xlsx · 2 highlights · 3 keys hidden": what went with a question, without its words. */
export function questionWhat(t: { files: string[]; highlights: number; pictures: number; hidden: number }): string {
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  const parts = [
    t.files.length ? t.files.slice(0, 3).join(', ') + (t.files.length > 3 ? ` and ${t.files.length - 3} more` : '') : '',
    t.highlights ? plural(t.highlights, 'highlight') : '',
    t.pictures ? plural(t.pictures, 'picture of the screen', 'pictures of the screen') : '',
    t.hidden ? `${plural(t.hidden, 'key')} hidden` : ''
  ]
  return parts.filter(Boolean).join(' · ')
}

const LIMIT = 200
const FOLDS: ReadonlySet<SentKind> = new Set(['question', 'job'])

/** Consecutive rows of one group fold into the newest, so an answer with three rounds is one line. */
export function fold(rows: (SentRow & { id: number })[]): SentItem[] {
  const out: SentItem[] = []
  let lastGroup: string | undefined
  for (const r of rows) {
    const last = out.at(-1)
    // A question's rounds and a job's requests fold; each search and page keeps its own row, since each says what went.
    if (last && r.group && r.group === lastGroup && r.kind === last.kind && FOLDS.has(r.kind)) {
      last.count++
      if (!last.what && r.what) last.what = r.what
      continue
    }
    lastGroup = r.group
    out.push({ id: r.id, at: r.at, kind: r.kind, service: r.service, host: r.host, local: r.local, ...(r.chatId ? { chatId: r.chatId } : {}), ...(r.group ? { group: r.group } : {}), what: r.what, count: 1 })
  }
  return out
}

interface Row {
  id: number
  at: number
  kind: SentKind
  service: string
  host: string
  local: number
  chat_id: string | null
  grp: string | null
  what: string
}

/** In `otty.db`, kept as long as chats are and cleared with them. */
export class SqliteSentLog implements SentLog {
  constructor(private db: DatabaseSync) {}

  add(r: SentRow): void {
    this.db
      .prepare('insert into sent(at, kind, service, host, local, chat_id, grp, what) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.at, r.kind, r.service, r.host, r.local ? 1 : 0, r.chatId ?? null, r.group ?? null, r.what)
  }

  list(limit = LIMIT): SentItem[] {
    const rows = this.db.prepare('select * from sent order by at desc, id desc limit ?').all(limit * 4) as unknown as Row[]
    return fold(
      rows.map((r) => ({
        id: r.id,
        at: r.at,
        kind: r.kind,
        service: r.service,
        host: r.host,
        local: Boolean(r.local),
        ...(r.chat_id ? { chatId: r.chat_id } : {}),
        ...(r.grp ? { group: r.grp } : {}),
        what: r.what
      }))
    ).slice(0, limit)
  }

  forgetChat(id: string): void {
    this.db.prepare('delete from sent where chat_id = ?').run(id)
  }

  clear(): void {
    this.db.exec('delete from sent')
  }

  prune(cutoff: number): void {
    this.db.prepare('delete from sent where at < ?').run(cutoff)
  }
}

/** With "Remember my chats" off: kept while Otty runs, so the list still answers "what left?", and gone on quit. */
export class MemorySentLog implements SentLog {
  private rows: (SentRow & { id: number })[] = []
  private next = 1

  add(r: SentRow): void {
    this.rows.push({ ...r, id: this.next++ })
    if (this.rows.length > LIMIT * 4) this.rows.shift()
  }

  list(limit = LIMIT): SentItem[] {
    return fold([...this.rows].sort((a, b) => b.at - a.at || b.id - a.id)).slice(0, limit)
  }

  forgetChat(id: string): void {
    this.rows = this.rows.filter((r) => r.chatId !== id)
  }

  clear(): void {
    this.rows = []
  }

  prune(cutoff: number): void {
    this.rows = this.rows.filter((r) => r.at >= cutoff)
  }
}

import type { DatabaseSync } from 'node:sqlite'
import type { ChangeItem } from '../shared/types'
import { maskSecrets } from '../shared/secrets'

// The action ledger (D-46): every change Otty makes is written down before it runs, with why and how to undo it, and
// marked once it's done. Try again reads it to say what it can take back, and Activity shows it. Like the sent log,
// it lives and dies with chats, and callers go through `begin`, which does nothing until main plugs a ledger in.

export type UndoKind = 'memory' | 'job' | 'none'

export interface ActionRow {
  id: number
  at: number
  /** A tool's name, or `step:<kind>` for a step card's button. */
  tool: string
  chatId?: string
  answerId?: string
  jobId?: string
  /** What happened, in plain words, with anything that looked like a key hidden. */
  summary: string
  undo: UndoKind
  /** The memory or job id that Undo acts on. */
  ref?: string
  /** What Undo would say: "Forget “likes tea”". */
  undoLabel?: string
  status: 'running' | 'done' | 'failed' | 'denied'
  undoneAt?: number
}

export type NewAction = Pick<ActionRow, 'tool' | 'chatId' | 'answerId' | 'jobId' | 'summary' | 'undo'>
export type Finish = Pick<ActionRow, 'status'> & Partial<Pick<ActionRow, 'summary' | 'ref' | 'undoLabel'>>

export interface Ledger {
  start(row: NewAction & { at: number }): number
  finish(id: number, f: Finish): void
  /** The rows of some answers in a chat, oldest first. */
  forAnswers(chatId: string, answerIds: string[]): ActionRow[]
  markUndone(chatId: string, kind: UndoKind, ref: string): void
  /** Newest first. */
  list(limit?: number): ChangeItem[]
  forgetChat(id: string): void
  clear(): void
  prune(cutoff: number): void
}

let ledger: () => Ledger | null = () => null

export function setLedger(get: () => Ledger | null): void {
  ledger = get
}

/** The ledger, if one is plugged in. */
export const actions = (): Ledger | null => ledger()

const clean = (text: string) => maskSecrets(text.slice(0, 160)).text

/**
 * Writes the row before the change runs, and returns what marks it done. Never throws: the ledger must never be the
 * reason something fails.
 */
export function begin(row: NewAction, log: Ledger | null = ledger()): (f: Finish) => void {
  try {
    if (!log) return () => {}
    const id = log.start({ ...row, summary: clean(row.summary), at: Date.now() })
    return (f) => {
      try {
        log.finish(id, f.summary === undefined ? f : { ...f, summary: clean(f.summary) })
      } catch (err) {
        console.error('Could not finish a ledger row', err)
      }
    }
  } catch (err) {
    console.error('Could not write a ledger row', err)
    return () => {}
  }
}

const toItem = (r: ActionRow): ChangeItem => ({
  id: r.id,
  at: r.at,
  summary: r.summary,
  status: r.status,
  canUndo: r.undo !== 'none',
  ...(r.chatId ? { chatId: r.chatId } : {}),
  ...(r.undoneAt ? { undone: true } : {})
})

const LIMIT = 200

interface Row {
  id: number
  at: number
  tool: string
  chat_id: string | null
  answer_id: string | null
  job_id: string | null
  summary: string
  undo: UndoKind
  ref: string | null
  undo_label: string | null
  status: ActionRow['status']
  undone_at: number | null
}

const fromRow = (r: Row): ActionRow => ({
  id: r.id,
  at: r.at,
  tool: r.tool,
  summary: r.summary,
  undo: r.undo,
  status: r.status,
  ...(r.chat_id ? { chatId: r.chat_id } : {}),
  ...(r.answer_id ? { answerId: r.answer_id } : {}),
  ...(r.job_id ? { jobId: r.job_id } : {}),
  ...(r.ref ? { ref: r.ref } : {}),
  ...(r.undo_label ? { undoLabel: r.undo_label } : {}),
  ...(r.undone_at ? { undoneAt: r.undone_at } : {})
})

/** In `otty.db`, kept as long as chats are and cleared with them. */
export class SqliteLedger implements Ledger {
  constructor(private db: DatabaseSync) {}

  start(r: NewAction & { at: number }): number {
    const { lastInsertRowid } = this.db
      .prepare("insert into actions(at, tool, chat_id, answer_id, job_id, summary, undo, status) values (?, ?, ?, ?, ?, ?, ?, 'running')")
      .run(r.at, r.tool, r.chatId ?? null, r.answerId ?? null, r.jobId ?? null, r.summary, r.undo)
    return Number(lastInsertRowid)
  }

  finish(id: number, f: Finish): void {
    this.db
      .prepare('update actions set status = ?, summary = coalesce(?, summary), ref = coalesce(?, ref), undo_label = coalesce(?, undo_label) where id = ?')
      .run(f.status, f.summary ?? null, f.ref ?? null, f.undoLabel ?? null, id)
  }

  forAnswers(chatId: string, answerIds: string[]): ActionRow[] {
    if (!answerIds.length) return []
    const marks = answerIds.map(() => '?').join(', ')
    const rows = this.db.prepare(`select * from actions where chat_id = ? and answer_id in (${marks}) order by id`).all(chatId, ...answerIds)
    return (rows as unknown as Row[]).map(fromRow)
  }

  markUndone(chatId: string, kind: UndoKind, ref: string): void {
    this.db.prepare('update actions set undone_at = ? where chat_id = ? and undo = ? and ref = ? and undone_at is null').run(Date.now(), chatId, kind, ref)
  }

  list(limit = LIMIT): ChangeItem[] {
    return (this.db.prepare('select * from actions order by at desc, id desc limit ?').all(limit) as unknown as Row[]).map((r) => toItem(fromRow(r)))
  }

  forgetChat(id: string): void {
    this.db.prepare('delete from actions where chat_id = ?').run(id)
  }

  clear(): void {
    this.db.exec('delete from actions')
  }

  prune(cutoff: number): void {
    this.db.prepare('delete from actions where at < ?').run(cutoff)
  }
}

/** With "Remember my chats" off: kept while Otty runs, and gone on quit. */
export class MemoryLedger implements Ledger {
  private rows: ActionRow[] = []
  private next = 1

  start(r: NewAction & { at: number }): number {
    const id = this.next++
    this.rows.push({ ...r, id, status: 'running' })
    return id
  }

  finish(id: number, f: Finish): void {
    const row = this.rows.find((r) => r.id === id)
    if (row) Object.assign(row, Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)))
  }

  forAnswers(chatId: string, answerIds: string[]): ActionRow[] {
    return this.rows.filter((r) => r.chatId === chatId && r.answerId !== undefined && answerIds.includes(r.answerId)).map((r) => ({ ...r }))
  }

  markUndone(chatId: string, kind: UndoKind, ref: string): void {
    for (const r of this.rows) if (r.chatId === chatId && r.undo === kind && r.ref === ref && !r.undoneAt) r.undoneAt = Date.now()
  }

  list(limit = LIMIT): ChangeItem[] {
    return [...this.rows]
      .sort((a, b) => b.at - a.at || b.id - a.id)
      .slice(0, limit)
      .map(toItem)
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

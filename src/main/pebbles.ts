import type { DatabaseSync } from 'node:sqlite'
import type { KeptPebble } from '../shared/pebbles'

// Kept Pebbles (step 1). Until the Pouch (step 2) gives them a screen of their own, they live and die with their chats:
// deleting a chat, forgetting all chats or "Keep chats for" takes them too, so nothing is kept where it can't be seen.

export interface PebbleStore {
  keep(p: KeptPebble): void
  drop(answerId: string, index: number): void
  /** The kept indexes of one answer's Pebbles. */
  keptIn(answerId: string): number[]
  forgetChat(chatId: string): void
  clear(): void
  prune(cutoff: number): void
}

interface Row {
  idx: number
}

export class SqlitePebbles implements PebbleStore {
  constructor(private db: DatabaseSync) {}

  keep(p: KeptPebble): void {
    this.db
      .prepare('insert or replace into pebbles(chat_id, answer_id, idx, kind, title, drawing, code, kept) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(p.chatId, p.answerId, p.index, p.kind, p.title, p.drawing, p.code, p.kept)
  }

  drop(answerId: string, index: number): void {
    this.db.prepare('delete from pebbles where answer_id = ? and idx = ?').run(answerId, index)
  }

  keptIn(answerId: string): number[] {
    return (this.db.prepare('select idx from pebbles where answer_id = ? order by idx').all(answerId) as unknown as Row[]).map((r) => r.idx)
  }

  forgetChat(chatId: string): void {
    this.db.prepare('delete from pebbles where chat_id = ?').run(chatId)
  }

  clear(): void {
    this.db.exec('delete from pebbles')
  }

  prune(cutoff: number): void {
    this.db.prepare('delete from pebbles where kept < ?').run(cutoff)
  }
}

/** With "Remember my chats" off: kept while Otty runs, like the chats. */
export class MemoryPebbles implements PebbleStore {
  private rows: KeptPebble[] = []

  keep(p: KeptPebble): void {
    this.drop(p.answerId, p.index)
    this.rows.push(p)
  }

  drop(answerId: string, index: number): void {
    this.rows = this.rows.filter((r) => !(r.answerId === answerId && r.index === index))
  }

  keptIn(answerId: string): number[] {
    return this.rows.filter((r) => r.answerId === answerId).map((r) => r.index).sort((a, b) => a - b)
  }

  forgetChat(chatId: string): void {
    this.rows = this.rows.filter((r) => r.chatId !== chatId)
  }

  clear(): void {
    this.rows = []
  }

  prune(cutoff: number): void {
    this.rows = this.rows.filter((r) => r.kept >= cutoff)
  }
}

import type { ChatMessage, ChatSearchHit, ChatSummary } from '../../shared/types'
import type { Message } from '../llm'

// Where saved chats live. Callers only see this interface, so a backend (JSON today, SQLite in D-3,
// maybe an online database later) can be swapped without touching them.

export interface Thread {
  id: string
  title: string
  app?: string
  createdAt: number
  updatedAt: number
  /** What the UI shows. */
  messages: ChatMessage[]
  /** What the model sees, so a reopened chat can carry on where it left off. */
  history: Message[]
}

/** Where to start writing: everything before these positions is already stored. */
export interface WriteFrom {
  messages: number
  history: number
}

/**
 * Async on purpose, even though SQLite answers synchronously, so a network backend fits without changing callers.
 * Every backend must pass the contract in `__tests__/search.contract.ts`.
 */
export interface ChatStore {
  /** Newest first. */
  list(opts?: { limit?: number }): Promise<ChatSummary[]>
  get(id: string): Promise<Thread | undefined>
  /**
   * Inserts or updates a thread, pictures stripped. With `from`, only messages and history from those positions on
   * are rewritten, so saving a turn costs the same however long the chat is. Does nothing for an empty thread.
   */
  write(t: Thread, from?: WriteFrom): Promise<void>
  delete(id: string): Promise<void>
  /** Forgets every chat, leaving nothing readable on disk. */
  clear(): Promise<void>
  /** Forgets chats last updated before `cutoff` (ms since epoch). Resolves to how many went. */
  prune(cutoff: number): Promise<number>
  /** Chats where every term of `q` appears; see `search.ts` for the rules all backends share. */
  search(q: string, opts?: { limit?: number }): Promise<ChatSearchHit[]>
}

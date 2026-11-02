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

/**
 * Async on purpose, even for synchronous backends, so a network one fits without changing callers.
 * Every backend must pass the contract in `__tests__/search.contract.ts`.
 */
export interface ChatStore {
  /** Newest first. */
  list(opts?: { limit?: number }): Promise<ChatSummary[]>
  get(id: string): Promise<Thread | undefined>
  /** Inserts or updates a thread (pictures stripped). Does nothing for an empty thread. */
  save(t: Thread): Promise<void>
  delete(id: string): Promise<void>
  clear(): Promise<void>
  /** Chats where every term of `q` appears; see `search.ts` for the rules all backends share. */
  search(q: string, opts?: { limit?: number }): Promise<ChatSearchHit[]>
}

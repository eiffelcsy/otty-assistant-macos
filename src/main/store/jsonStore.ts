import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { ChatSearchHit, ChatSummary } from '../../shared/types'
import { searchThreads } from './search'
import type { ChatStore, Thread } from './types'

// Saved chats as one JSON file of text-only threads. Screen snips are never written to disk.

const MAX_CHATS = 50
const SNIP_GONE = '(The user shared a picture here: a screen snip or an image file. It was not kept, so it can no longer be seen.)'

/** A copy of the thread with every picture removed. */
export function withoutImages(t: Thread): Thread {
  return {
    ...t,
    messages: t.messages.map((m) => {
      if (m.role !== 'user') return m
      const files = m.files?.map(({ thumb: _thumb, ...f }) => f)
      const context = m.context?.kind === 'image' ? { ...m.context, dataUrl: '' } : m.context
      return { ...m, context, ...(files ? { files } : {}) }
    }),
    history: t.history.map((m) =>
      m.role === 'user' && Array.isArray(m.content)
        ? { ...m, content: m.content.map((p) => (p.type === 'image_url' ? { type: 'text' as const, text: SNIP_GONE } : p)) }
        : m
    )
  }
}

export class JsonChatStore implements ChatStore {
  private cache: Thread[] | null = null

  constructor(private file: string) {}

  private load(): Thread[] {
    if (this.cache) return this.cache
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      this.cache = Array.isArray(parsed) ? parsed : []
    } catch {
      this.cache = []
    }
    return this.cache
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.cache), { mode: 0o600 })
  }

  async list(opts?: { limit?: number }): Promise<ChatSummary[]> {
    return this.load()
      .slice(0, opts?.limit)
      .map(({ id, title, app, updatedAt }) => ({ id, title, app, updatedAt }))
  }

  async get(id: string): Promise<Thread | undefined> {
    return this.load().find((t) => t.id === id)
  }

  async save(t: Thread): Promise<void> {
    if (!t.messages.length) return
    const chats = this.load().filter((c) => c.id !== t.id)
    chats.unshift(withoutImages(t))
    this.cache = chats.slice(0, MAX_CHATS)
    this.persist()
  }

  async delete(id: string): Promise<void> {
    this.cache = this.load().filter((t) => t.id !== id)
    this.persist()
  }

  async clear(): Promise<void> {
    this.cache = []
    rmSync(this.file, { force: true })
  }

  async search(q: string, opts?: { limit?: number }): Promise<ChatSearchHit[]> {
    return searchThreads(this.load(), q, opts)
  }
}

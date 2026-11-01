import { app } from 'electron'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ChatMessage, ChatSummary } from '../shared/types'
import type { Message } from './llm'
import { getStored } from './settings'

// Saved chats: one JSON file of text-only threads. Screen snips are never written to disk.

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

const MAX_CHATS = 50
const SNIP_GONE = '(The user shared a screen snip here. It was not kept, so it can no longer be seen.)'

let cache: Thread[] | null = null

function file(): string {
  return join(app.getPath('userData'), 'chats.json')
}

function load(): Thread[] {
  if (cache) return cache
  try {
    cache = JSON.parse(readFileSync(file(), 'utf8'))
    if (!Array.isArray(cache)) cache = []
  } catch {
    cache = []
  }
  return cache!
}

function persist(): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(cache), { mode: 0o600 })
}

/** A copy of the thread with every picture removed. */
function withoutImages(t: Thread): Thread {
  return {
    ...t,
    messages: t.messages.map((m) =>
      m.role === 'user' && m.context?.kind === 'image' ? { ...m, context: { ...m.context, dataUrl: '' } } : m
    ),
    history: t.history.map((m) =>
      m.role === 'user' && Array.isArray(m.content)
        ? { ...m, content: m.content.map((p) => (p.type === 'image_url' ? { type: 'text' as const, text: SNIP_GONE } : p)) }
        : m
    )
  }
}

export function listChats(): ChatSummary[] {
  return load().map(({ id, title, app, updatedAt }) => ({ id, title, app, updatedAt }))
}

export function getChat(id: string): Thread | undefined {
  return load().find((t) => t.id === id)
}

/** Inserts or updates a thread, newest first. Does nothing for empty threads or when saving is off. */
export function saveChat(t: Thread): void {
  if (!getStored().rememberChats || !t.messages.length) return
  const chats = load().filter((c) => c.id !== t.id)
  chats.unshift(withoutImages(t))
  cache = chats.slice(0, MAX_CHATS)
  persist()
}

export function deleteChat(id: string): void {
  cache = load().filter((t) => t.id !== id)
  persist()
}

export function clearChats(): void {
  cache = []
  rmSync(file(), { force: true })
}

import type { MemoryKind, MemoryNote } from '../../shared/types'
import { judge, mayForget, type LearnTurn } from './guard'
import { cleanMemory, type MemoryStore } from './store'
import type { ToolOutcome } from '../tools'

// The `remember` and `forget` tools. There's no confirm card: Otty saves on its own and always shows what it saved,
// so trust comes from the Noted line and its Undo.

/** Inferences per answer. Being told doesn't count: the user can list as much as they like. */
const MAX_INFERRED = 2

const KINDS = new Set<MemoryKind>(['about', 'preference', 'habit', 'person', 'goal'])

export interface LearnResult {
  outcome: ToolOutcome
  note?: MemoryNote
}

export interface Where {
  chatId: string
  messageId: string
  /** Inferences saved so far this turn. */
  inferred: number
}

const refused = (result: string): LearnResult => ({ outcome: { result, status: 'denied' } })

export function remember(store: MemoryStore, args: Record<string, unknown>, turn: LearnTurn, where: Where, now = Date.now()): LearnResult {
  const text = cleanMemory(String(args.text ?? ''))
  if (!text) return refused('Not saved: there was nothing to remember.')
  const verdict = judge(text, turn)
  if (!verdict.ok) return refused(verdict.why)
  if (verdict.origin === 'inferred' && where.inferred >= MAX_INFERRED) return refused('Not saved: that’s enough noting for one answer.')

  const confidence = verdict.origin === 'told' ? 1 : Math.min(1, Math.max(0, Number(args.confidence ?? 0.7) || 0.7))
  const until = args.until ? +new Date(String(args.until)) : NaN
  const expiresAt = until > now ? until : undefined
  const replaces = Number(args.replaces)
  const old = (Number.isInteger(replaces) ? store.get(replaces) : undefined) ?? store.findSimilar(text, now)

  if (old) {
    if (old.text === text) return { outcome: { result: 'Already known.', status: 'done' } }
    store.update(old.id, { text, confidence: Math.max(confidence, old.confidence), ...(expiresAt ? { expiresAt } : {}) }, now)
    return { outcome: { result: `Updated #${old.id}.`, status: 'done' }, note: { memoryId: old.id, text, action: 'updated', before: old.text } }
  }

  const kind = KINDS.has(args.kind as MemoryKind) ? (args.kind as MemoryKind) : 'about'
  const added = store.add({ text, kind, origin: verdict.origin, confidence, sourceChatId: where.chatId, sourceMessageId: where.messageId, expiresAt }, now)
  if (verdict.origin === 'inferred') where.inferred++
  return { outcome: { result: `Saved as #${added.id}.`, status: 'done' }, note: { memoryId: added.id, text, action: 'added' } }
}

export function forget(store: MemoryStore, args: Record<string, unknown>, turn: LearnTurn): LearnResult {
  if (!mayForget(turn)) return refused('Not removed: the user didn’t ask for that.')
  const id = Number(args.id)
  const memory = Number.isInteger(id) ? store.get(id) : undefined
  if (!memory) return { outcome: { result: 'There’s no memory with that number.', status: 'error' } }
  store.remove(memory.id)
  return { outcome: { result: 'Forgotten.', status: 'done' }, note: { memoryId: memory.id, text: memory.text, action: 'forgotten', kind: memory.kind } }
}

/** Puts things back as they were. Returns the note as it should now show. */
export function undo(store: MemoryStore, note: MemoryNote): MemoryNote {
  if (note.action === 'added') store.remove(note.memoryId)
  if (note.action === 'updated' && note.before !== undefined) store.update(note.memoryId, { text: note.before })
  if (note.action === 'forgotten') store.add({ text: note.text, kind: note.kind, origin: 'told' })
  return { ...note, undone: true }
}

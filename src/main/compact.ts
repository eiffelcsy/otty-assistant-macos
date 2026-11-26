import type { Message } from './providers/types'

// Making room (D-78): old parts of a chat are shortened by code, never by the model. Ids, tool calls and order stay,
// so the history is still valid for both API formats, and the last turns the user typed are never touched.

const RESULT_MAX = 500
const TEXT_MAX = 4000
const TEXT_KEEP = 1000

/** A message the user wrote, not one that only carries tool results (Anthropic sends those as `user`). */
function typed(m: Message): boolean {
  if (m.role !== 'user') return false
  return typeof m.content === 'string' || (Array.isArray(m.content) && m.content.some((p) => p.type === 'text'))
}

const num = (n: number) => n.toLocaleString('en-US')

/** Shortens one message. Returns the same object when nothing in it changes. */
function shorten(m: Message): { message: Message; changed: boolean } {
  if (m.role === 'tool' && m.content.length > RESULT_MAX) {
    const note = `[An earlier result (${num(m.content.length)} characters) was set aside to fit the chat. Ask for it again if it’s needed.]`
    return { message: { ...m, content: note }, changed: true }
  }
  if (m.role === 'assistant' && m.reasoning_content !== undefined) {
    const { reasoning_content: _dropped, ...rest } = m
    return { message: rest, changed: true }
  }
  if (m.role === 'user' && typeof m.content === 'string' && m.content.length > TEXT_MAX) {
    const rest = m.content.length - TEXT_KEEP
    return { message: { ...m, content: `${m.content.slice(0, TEXT_KEEP)}\n\n[… about ${num(rest)} more characters were set aside to fit the chat.]` }, changed: true }
  }
  if (m.role === 'user' && Array.isArray(m.content)) {
    let changed = false
    const parts = m.content.map((p) => {
      if (p.type === 'image_url') {
        changed = true
        return { type: 'text' as const, text: '[A picture was here; it was set aside to fit the chat.]' }
      }
      if (p.type === 'text' && p.text.length > TEXT_MAX) {
        changed = true
        const rest = p.text.length - TEXT_KEEP
        return { type: 'text' as const, text: `${p.text.slice(0, TEXT_KEEP)}\n\n[… about ${num(rest)} more characters were set aside to fit the chat.]` }
      }
      return p
    })
    if (changed) return { message: { ...m, content: parts }, changed: true }
  }
  return { message: m, changed: false }
}

/** Shortens everything before the last `keepTurns` questions the user typed. Never changes its input. */
export function compactHistory(history: Message[], keepTurns = 2): { history: Message[]; setAside: number } {
  // Fewer typed turns than kept (a job has only its brief): the newest two messages stay whole instead.
  const turns = history.flatMap((m, i) => (typed(m) ? [i] : []))
  const cut = turns.length >= keepTurns ? turns[turns.length - keepTurns] : Math.max(0, history.length - 2)
  let setAside = 0
  const out = history.map((m, i) => {
    if (i >= cut) return m
    const { message, changed } = shorten(m)
    if (changed) setAside++
    return message
  })
  return { history: out, setAside }
}

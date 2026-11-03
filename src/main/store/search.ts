import type { ChatSearchHit } from '../../shared/types'
import { findRanges, fold, parseQuery } from '../../shared/match'
import type { Thread } from './types'

export { findRanges, parseQuery }

// Chat search rules shared by every backend:
// - The query is NFKC-normalised, lower-cased and split on spaces into terms. Quotes ("…", “…”, 「…」) keep a phrase.
// - A chat matches when every term is a case-insensitive substring of its title, its messages, a text capture
//   or an attached file's name.
//   Substrings rather than words, because Chinese has no spaces.
// - Ranking: a title match first, then more matching messages, then the most recently updated.
// The matching itself (fold, parseQuery, findRanges) is in shared/match.ts, which find-in-chat uses too.
// This file is the in-memory implementation, used by the JSON backend.

const SNIPPET_WIDTH = 120
const SNIPPET_LEAD = 40
const DEFAULT_LIMIT = 20

/** Markdown down to the words a reader sees: link text, no markers. */
export function plainText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)+/gm, '')
    .replace(/\*\*|__|~~|`+/g, '')
    .replace(/(^|[^\w*])\*([^*\n]+)\*/g, '$1$2')
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

interface Field {
  /** Absent for the title. */
  messageId?: string
  /** As shown: plain text on one line. */
  text: string
  folded: string
}

function fields(t: Thread): Field[] {
  const out: Field[] = []
  const add = (text: string, messageId?: string) => {
    const line = oneLine(text)
    if (line) out.push({ messageId, text: line, folded: fold(line) })
  }
  add(t.title)
  for (const m of t.messages) {
    if (m.role === 'user') {
      add(m.text, m.id)
      for (const c of m.captures) if (c.context.kind === 'text') add(c.context.text, m.id)
      for (const f of m.files ?? []) add(f.name, m.id)
    } else {
      add(plainText(m.text), m.id)
    }
  }
  return out
}

const isLowSurrogate = (s: string, i: number) => i > 0 && i < s.length && (s.charCodeAt(i) & 0xfc00) === 0xdc00

/** About 120 characters around the first match, with every match inside it marked. */
export function makeSnippet(text: string, terms: string[]): ChatSearchHit['snippet'] {
  const all = findRanges(text, terms)
  const first = all[0]?.[0] ?? 0
  let start = Math.max(0, first - SNIPPET_LEAD)
  if (start > 0) {
    const space = text.indexOf(' ', start)
    if (space !== -1 && space < first) start = space + 1
  }
  let end = Math.min(text.length, start + SNIPPET_WIDTH)
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end)
    if (space > Math.max(first, start + SNIPPET_WIDTH - 20)) end = space
  }
  if (isLowSurrogate(text, start)) start++
  if (isLowSurrogate(text, end)) end--

  const lead = start > 0 ? '…' : ''
  const shift = lead.length - start
  const ranges = all
    .filter(([s, e]) => e > start && s < end)
    .map(([s, e]): [number, number] => [Math.max(s, start) + shift, Math.min(e, end) + shift])
  return { text: lead + text.slice(start, end).trimEnd() + (end < text.length ? '…' : ''), ranges }
}

/** Searches threads in memory. */
export function searchThreads(threads: Thread[], q: string, opts?: { limit?: number }): ChatSearchHit[] {
  const terms = parseQuery(q)
  if (!terms.length) return []

  const scored: { hit: ChatSearchHit; titleHit: boolean; messages: number }[] = []
  for (const t of threads) {
    const fs = fields(t)
    if (!terms.every((term) => fs.some((f) => f.folded.includes(term)))) continue

    // The message holding the most terms (the first, on a tie) is the one to show and scroll to.
    const byMessage = new Map<string, Field[]>()
    for (const f of fs) if (f.messageId) byMessage.set(f.messageId, [...(byMessage.get(f.messageId) ?? []), f])
    const termsIn = (f: Field) => terms.filter((term) => f.folded.includes(term)).length
    let matching = 0
    let best: { messageId: string; count: number; field: Field } | undefined
    for (const [messageId, mfs] of byMessage) {
      const count = terms.filter((term) => mfs.some((f) => f.folded.includes(term))).length
      if (!count) continue
      matching++
      if (!best || count > best.count) {
        const field = mfs.reduce((a, b) => (termsIn(b) > termsIn(a) ? b : a))
        best = { messageId, count, field }
      }
    }

    // A title-only match still shows the start of the chat.
    const shown = best?.field ?? fs.find((f) => f.messageId)
    scored.push({
      hit: {
        chatId: t.id,
        title: t.title,
        app: t.app,
        updatedAt: t.updatedAt,
        messageId: best?.messageId,
        snippet: shown ? makeSnippet(shown.text, terms) : { text: '', ranges: [] }
      },
      titleHit: terms.some((term) => fold(oneLine(t.title)).includes(term)),
      messages: matching
    })
  }

  scored.sort(
    (a, b) => Number(b.titleHit) - Number(a.titleHit) || b.messages - a.messages || b.hit.updatedAt - a.hit.updatedAt
  )
  return scored.slice(0, opts?.limit ?? DEFAULT_LIMIT).map((s) => s.hit)
}

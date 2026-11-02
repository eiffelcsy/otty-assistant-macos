import type { ChatSearchHit } from '../../shared/types'
import type { Thread } from './types'

// Chat search rules shared by every backend:
// - The query is NFKC-normalised, lower-cased and split on spaces into terms. Quotes ("…", “…”, 「…」) keep a phrase.
// - A chat matches when every term is a case-insensitive substring of its title, its messages or a text capture.
//   Substrings rather than words, because Chinese has no spaces.
// - Ranking: a title match first, then more matching messages, then the most recently updated.
// This file is the in-memory implementation, used by the JSON backend.

const SNIPPET_WIDTH = 120
const SNIPPET_LEAD = 40
const DEFAULT_LIMIT = 20

/** Folds text for matching. Assumes whitespace is already collapsed. */
function fold(s: string): string {
  return s.normalize('NFKC').toLowerCase()
}

/** Splits a query into unique, folded terms. Quoted parts stay together. */
export function parseQuery(q: string): string[] {
  const terms = new Set<string>()
  for (const m of fold(q).matchAll(/["“”「『]([^"“”」』]*)["“”」』]?|(\S+)/g)) {
    const t = (m[1] ?? m[2]).replace(/\s+/g, ' ').trim()
    if (t) terms.add(t)
  }
  return [...terms]
}

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
      if (m.context?.kind === 'text') add(m.context.text, m.id)
    } else {
      add(plainText(m.text), m.id)
    }
  }
  return out
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Where each term occurs in `text`, as merged [start, end) offsets into the original (unfolded) text. */
export function findRanges(text: string, terms: string[]): [number, number][] {
  // Fold one grapheme at a time, remembering where each folded unit came from, so offsets survive NFKC and case changes.
  let folded = ''
  const from: number[] = []
  const to: number[] = []
  for (const { segment, index } of segmenter.segment(text)) {
    const f = fold(segment)
    folded += f
    for (let i = 0; i < f.length; i++) {
      from.push(index)
      to.push(index + segment.length)
    }
  }
  const ranges: [number, number][] = []
  for (const term of terms) {
    for (let i = folded.indexOf(term); i !== -1; i = folded.indexOf(term, i + term.length)) {
      ranges.push([from[i], to[i + term.length - 1]])
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
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

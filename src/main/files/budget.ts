import type { Extracted } from './extract'
import type { NotebookCell } from './notebook'

// Keeps attached documents inside the model's context window. v1 sends whole files when they fit,
// otherwise the first part, and says so to the user and the model. (v2: local retrieval, see D-6.)

/** Tokens for all of one message's documents together: about half of a 128K-token window. */
export const FILE_TOKEN_BUDGET = 48_000

/** The same share of any model's window: 48K of 128K, leaving room for the chat and the answer. */
export function fileBudget(contextTokens: number): number {
  return Math.floor(contextTokens * 0.375)
}

const WIDE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/

/** A rough token count: about one per CJK character, about four characters per token otherwise. */
export function estimateTokens(s: string): number {
  let wide = 0
  for (const ch of s) if (WIDE.test(ch)) wide++
  return Math.ceil(wide + (s.length - wide) / 4)
}

/** The longest start of `s` that fits in `tokens`. */
export function cutToTokens(s: string, tokens: number): string {
  let used = 0
  let i = 0
  for (const ch of s) {
    used += WIDE.test(ch) ? 1 : 0.25
    if (used > tokens) break
    i += ch.length
  }
  return s.slice(0, i)
}

/**
 * Shares the budget fairly: small files get all they need, and what's left is split evenly between the big ones.
 * Returns each item's allowance, in the same order.
 */
export function shareBudget(needs: number[], budget: number): number[] {
  const order = needs.map((need, i) => ({ need, i })).sort((a, b) => a.need - b.need)
  const out = new Array<number>(needs.length)
  let left = budget
  order.forEach(({ need, i }, k) => {
    const give = Math.min(need, Math.floor(left / (order.length - k)))
    out[i] = give
    left -= give
  })
  return out
}

export interface Fitted {
  /** The labelled block that goes into the user's message. */
  block: string
  /** Shown to the user when only part was read, e.g. "Otty read the first 40 of 120 pages." */
  note?: string
  pages?: number
}

/** Code is sent with line numbers, `  42│ x = 1`, so answers can point to real lines. */
export function numberLines(text: string): string[] {
  const lines = text.split('\n')
  const width = String(lines.length).length
  return lines.map((l, i) => `${String(i + 1).padStart(width)}│ ${l}`)
}

/** The marker for a notebook cell: `--- cell 3 · code [7] ---` or `--- cell 4 · notes ---`. */
function cellMarker(i: number, c: NotebookCell): string {
  return `--- cell ${i + 1} · ${c.type}${c.count !== undefined ? ` [${c.count}]` : ''} ---`
}

/** The parts a document is cut by, already labelled: pages, cells, or numbered lines. */
function partsOf(doc: Extracted): string[] | null {
  if (doc.kind === 'pdf') return doc.pages.map((p, i) => `--- page ${i + 1} ---\n${p}`)
  if (doc.kind === 'notebook') return doc.cells.map((c, i) => `${cellMarker(i, c)}\n${c.text}`)
  if (doc.kind === 'code') return numberLines(doc.text)
  return null
}

const plural = (n: number, word: string) => `${n.toLocaleString('en')} ${word}${n === 1 ? '' : 's'}`

/** The file's label: `[File 1: report.pdf · 12 pages]`, `[File 2: train.py · Python · 240 lines]`. */
function headOf(n: number, name: string, doc: Extracted): string {
  if (doc.kind === 'pdf') return `[File ${n}: ${name} · ${plural(doc.pages.length, 'page')}]`
  if (doc.kind === 'notebook') return `[File ${n}: ${name} · ${doc.lang} notebook · ${plural(doc.cells.length, 'cell')}]`
  if (doc.kind === 'code') return `[File ${n}: ${name} · ${doc.lang} · ${plural(doc.text.split('\n').length, 'line')}]`
  return `[File ${n}: ${name}]`
}

/** Tells the model what was hidden, so "what's my key?" gets an honest answer. */
function hiddenLine(doc: Extracted): string {
  const hidden = 'hidden' in doc ? doc.hidden : 0
  return hidden ? `\n(Otty replaced ${plural(hidden, 'thing')} that looked like a key or password with [hidden key] before sending. You can't see them.)` : ''
}

/** Formats one document as a labelled block, with page, cell or line markers, cut to `allowance` tokens. */
export function fitDocument(n: number, name: string, doc: Extracted, allowance: number): Fitted {
  const head = headOf(n, name, doc) + hiddenLine(doc)
  const pages = doc.kind === 'pdf' ? doc.pages.length : undefined
  const parts = partsOf(doc)
  if (parts) {
    const total = parts.length
    const kept: string[] = []
    let used = 0
    for (const part of parts) {
      const cost = estimateTokens(part) + (doc.kind === 'code' ? 0.25 : 0)
      if (used + cost > allowance) {
        // Always send something: the start of the first part if even that doesn't fit.
        if (!kept.length) kept.push(cutToTokens(part, allowance))
        break
      }
      kept.push(part)
      used += cost
    }
    const read = kept.length
    const body = kept.join('\n')
    if (read >= total) return { block: `${head}\n${body}\n[End of file ${n}]`, pages }
    const unit = doc.kind === 'pdf' ? 'pages' : doc.kind === 'notebook' ? 'cells' : 'lines'
    const what = `${unit} 1–${read.toLocaleString('en')} of ${total.toLocaleString('en')}`
    return {
      block: `${head}\n(Only ${what} fit, so the rest wasn't included. If the answer could be later in the file, say so.)\n${body}\n[End of what was included from file ${n}]`,
      note: doc.kind === 'pdf' ? `Otty read the first ${read} of ${total} pages.` : `Otty read ${what}.`,
      pages
    }
  }

  const text = (doc as { text: string }).text
  const need = estimateTokens(text)
  if (need <= allowance) return { block: `${head}\n${text}\n[End of file ${n}]` }
  const part = cutToTokens(text, allowance)
  const percent = Math.max(1, Math.floor((part.length / text.length) * 100))
  return {
    block: `${head}\n(Only the first ${percent}% fit, so the rest wasn't included. If the answer could be later in the file, say so.)\n${part}\n[End of what was included from file ${n}]`,
    note: `Otty read about the first ${percent}% of this file.`
  }
}

export function documentTokens(doc: Extracted): number {
  const parts = partsOf(doc)
  if (parts) return parts.reduce((n, p) => n + estimateTokens(p) + (doc.kind === 'code' ? 0.25 : 0), 0)
  return estimateTokens((doc as { text: string }).text)
}

export interface FileInput {
  name: string
  doc?: Extracted
  /** A picture's data URL. */
  image?: string
}

export interface FileOutput {
  /** The label (and, for documents, the text) that goes into the user's message. */
  text: string
  image?: string
  note?: string
  pages?: number
}

/** Numbers one message's files and fits their documents into the shared budget. */
export function fitFiles(files: FileInput[], budget = FILE_TOKEN_BUDGET): FileOutput[] {
  const allowances = shareBudget(
    files.map((f) => (f.doc ? documentTokens(f.doc) : 0)),
    budget
  )
  return files.map((f, i) => {
    if (!f.doc) return { text: `[File ${i + 1}: ${f.name} · a picture, attached]`, image: f.image }
    const { block, note, pages } = fitDocument(i + 1, f.name, f.doc, allowances[i])
    return { text: block, note, pages }
  })
}

/** The start of some documents' words, enough to tell which language they're in. Code's own words don't count. */
export function sampleText(docs: (Extracted | undefined)[], chars = 2000): string {
  let out = ''
  for (const doc of docs) {
    if (!doc || doc.kind === 'code') continue
    const text = doc.kind === 'pdf' ? doc.pages.join('\n') : doc.kind === 'notebook' ? doc.cells.filter((c) => c.type === 'notes').map((c) => c.text).join('\n') : doc.text
    out += text.slice(0, chars - out.length) + '\n'
    if (out.length >= chars) break
  }
  return out.trim()
}

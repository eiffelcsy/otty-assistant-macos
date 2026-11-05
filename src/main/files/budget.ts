import type { Extracted } from './extract'

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

/** Formats one document as `[File n: name · 12 pages]` with page markers, cut to `allowance` tokens. */
export function fitDocument(n: number, name: string, doc: Extracted, allowance: number): Fitted {
  if (doc.kind === 'pdf') {
    const total = doc.pages.length
    const parts: string[] = []
    let used = 0
    for (const [i, page] of doc.pages.entries()) {
      const part = `--- page ${i + 1} ---\n${page}`
      const cost = estimateTokens(part)
      if (used + cost > allowance) {
        // Always send something: the start of the first page if even that doesn't fit.
        if (!parts.length) parts.push(cutToTokens(part, allowance))
        break
      }
      parts.push(part)
      used += cost
    }
    const read = parts.length
    const head = `[File ${n}: ${name} · ${total} page${total === 1 ? '' : 's'}]`
    if (read >= total) return { block: `${head}\n${parts.join('\n')}\n[End of file ${n}]`, pages: total }
    return {
      block: `${head}\n(Only pages 1–${read} of ${total} fit, so the rest wasn't included. If the answer could be later in the file, say so.)\n${parts.join('\n')}\n[End of what was included from file ${n}]`,
      note: `Otty read the first ${read} of ${total} pages.`,
      pages: total
    }
  }

  const head = `[File ${n}: ${name}]`
  const need = estimateTokens(doc.text)
  if (need <= allowance) return { block: `${head}\n${doc.text}\n[End of file ${n}]` }
  const part = cutToTokens(doc.text, allowance)
  const percent = Math.max(1, Math.floor((part.length / doc.text.length) * 100))
  return {
    block: `${head}\n(Only the first ${percent}% fit, so the rest wasn't included. If the answer could be later in the file, say so.)\n${part}\n[End of what was included from file ${n}]`,
    note: `Otty read about the first ${percent}% of this file.`
  }
}

export function documentTokens(doc: Extracted): number {
  return doc.kind === 'pdf' ? doc.pages.reduce((n, p, i) => n + estimateTokens(`--- page ${i + 1} ---\n${p}`), 0) : estimateTokens(doc.text)
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

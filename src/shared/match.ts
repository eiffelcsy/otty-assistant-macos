// Text matching shared by chat search (main, store/search.ts) and find-in-chat (renderer, lib/findInChat.ts):
// NFKC + lower-case folding, quoted phrases, and substring ranges mapped back to the original text.

/** Folds text for matching. Assumes whitespace is already collapsed. */
export function fold(s: string): string {
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

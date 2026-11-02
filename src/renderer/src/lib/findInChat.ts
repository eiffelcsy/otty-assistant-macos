import { findRanges, parseQuery } from '../../../shared/match'

// Find in this chat (D-7): the same matching rules as chat search, run over the text the reader sees.
// Matches become DOM Ranges, painted with the CSS Custom Highlight API so the Markdown render is never touched.

/** A point in a list of texts: which one, and how far in. */
export type Point = [index: number, offset: number]

/** Where the query's terms occur across consecutive texts (one message's text nodes), as [start, end) points. */
export function matchTexts(texts: string[], query: string): [Point, Point][] {
  const terms = parseQuery(query)
  if (!terms.length) return []
  const starts: number[] = []
  let joined = ''
  for (const t of texts) {
    starts.push(joined.length)
    joined += t
  }
  // A start sits in the text that holds it; an end at a boundary stays at the end of the text before it.
  const at = (pos: number, isEnd: boolean): Point => {
    let i = texts.length - 1
    while (i > 0 && (isEnd ? starts[i] >= pos : starts[i] > pos)) i--
    return [i, pos - starts[i]]
  }
  return findRanges(joined, terms).map(([s, e]) => [at(s, false), at(e, true)])
}

/** Text nodes a reader would search: answer words (explain terms included), not buttons like Copy or "In 中文". */
function readableText(el: Element): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('button:not(.explain-term), .explain-card')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  return nodes
}

/** Every match in the chat, message by message, in reading order. Matches never span two messages. */
export function findInChat(root: Element, query: string): Range[] {
  const ranges: Range[] = []
  for (const msg of root.querySelectorAll('[data-msg-id]')) {
    const nodes = readableText(msg)
    for (const [[si, so], [ei, eo]] of matchTexts(nodes.map((n) => n.data), query)) {
      const r = document.createRange()
      r.setStart(nodes[si], so)
      r.setEnd(nodes[ei], eo)
      ranges.push(r)
    }
  }
  return ranges
}

const ALL = 'otty-find'
const CURRENT = 'otty-find-current'

/** Paints the matches, the current one stronger. Pass nothing to clear. */
export function paintMatches(ranges: Range[] = [], current = -1): void {
  if (!('highlights' in CSS)) return
  if (!ranges.length) {
    CSS.highlights.delete(ALL)
    CSS.highlights.delete(CURRENT)
    return
  }
  CSS.highlights.set(ALL, new Highlight(...ranges.filter((_, i) => i !== current)))
  if (ranges[current]) CSS.highlights.set(CURRENT, new Highlight(ranges[current]))
  else CSS.highlights.delete(CURRENT)
}

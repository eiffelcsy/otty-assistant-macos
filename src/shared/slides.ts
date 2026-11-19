// Otty's slides format (D-30): Markdown with `---` between slides, drawn by Otty's own template.
// The model writes text; this file turns it into a typed deck and then into self-contained HTML.
// Pure, so it's tested without a DOM, and every piece of the model's text is escaped on the way out.
//
//   # Title                     each slide starts with a heading
//   - a bullet, **bold**, *italic*, `code`
//   ::: columns                 two columns, split by a line with |||, closed by :::
//   > a quote
//   ~~~mermaid … ~~~            a diagram (~~~, because ``` would end the slides block)
//   Note: what to say           speaker notes, never on the slide

export type Block =
  | { kind: 'para'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'diagram'; code: string }
  | { kind: 'columns'; left: Block[]; right: Block[] }

export type Layout = 'title' | 'big' | 'quote' | 'diagram' | 'columns' | 'bullets'

export interface Slide {
  title: string
  layout: Layout
  blocks: Block[]
  notes: string[]
}

export interface Deck {
  slides: Slide[]
}

/** More than this is a document, not a deck. */
export const MAX_SLIDES = 30

const SEPARATOR = /^\s*---+\s*$/
const FENCE = /^\s*(~~~|```)\s*([\w-]*)\s*$/

/** Splits on `---` lines, but never inside a diagram fence. */
function splitSlides(src: string): string[][] {
  const slides: string[][] = [[]]
  let fence: string | null = null
  for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
    const f = line.match(FENCE)
    if (f) fence = fence === null ? f[1] : fence === f[1] ? null : fence
    if (fence === null && !f && SEPARATOR.test(line)) slides.push([])
    else slides[slides.length - 1].push(line)
  }
  const kept = slides.filter((s) => s.some((l) => l.trim()))
  return kept.length === 1 ? splitOnHeadings(kept[0]) : kept
}

/** Models sometimes forget the `---` lines; then each top-level `# ` heading (outside a diagram) starts a slide. */
function splitOnHeadings(lines: string[]): string[][] {
  const slides: string[][] = [[]]
  let fence: string | null = null
  for (const line of lines) {
    const f = line.match(FENCE)
    if (f) fence = fence === null ? f[1] : fence === f[1] ? null : fence
    if (fence === null && /^#\s/.test(line) && slides[slides.length - 1].some((l) => /^#\s/.test(l))) slides.push([])
    slides[slides.length - 1].push(line)
  }
  return slides
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  const para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ').trim() })
    para.length = 0
  }
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    const fence = line.match(FENCE)
    if (fence) {
      flush()
      const close = fence[1]
      const body: string[] = []
      i++
      while (i < lines.length && !(lines[i].trim() === close)) body.push(lines[i++])
      i++
      if (fence[2] === 'mermaid' && body.some((l) => l.trim())) blocks.push({ kind: 'diagram', code: body.join('\n') })
      else if (body.length) blocks.push({ kind: 'para', text: body.join(' ') })
      continue
    }
    if (/^:::\s*columns\s*$/i.test(t)) {
      flush()
      const left: string[] = []
      const right: string[] = []
      let side = left
      i++
      while (i < lines.length && lines[i].trim() !== ':::') {
        if (lines[i].trim() === '|||') side = right
        else side.push(lines[i])
        i++
      }
      i++
      blocks.push({ kind: 'columns', left: parseBlocks(left), right: parseBlocks(right) })
      continue
    }
    const bullet = t.match(/^[-*•]\s+(.*)$/)
    const numbered = t.match(/^\d+[.)]\s+(.*)$/)
    if (bullet || numbered) {
      flush()
      const ordered = Boolean(numbered)
      const items: string[] = []
      while (i < lines.length) {
        const m = ordered ? lines[i].trim().match(/^\d+[.)]\s+(.*)$/) : lines[i].trim().match(/^[-*•]\s+(.*)$/)
        if (!m) break
        items.push(m[1])
        i++
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    if (t.startsWith('>')) {
      flush()
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) quote.push(lines[i++].trim().replace(/^>\s?/, ''))
      blocks.push({ kind: 'quote', text: quote.join(' ').trim() })
      continue
    }
    if (!t) flush()
    else para.push(t)
    i++
  }
  flush()
  return blocks
}

/** A headline that's a number: "42%", "$1.2M", "3×", "120 km". */
const BIG = /^[~≈+\-$€£¥]?\s?\d[\d.,]*\s?(?:%|×|x|[kKmMbB]n?|[a-zA-Z]{1,3})?$/

function layoutOf(slide: Omit<Slide, 'layout'>, first: boolean): Layout {
  const { blocks, title } = slide
  if (blocks.some((b) => b.kind === 'diagram')) return 'diagram'
  if (blocks.some((b) => b.kind === 'columns')) return 'columns'
  if (blocks.length && blocks.every((b) => b.kind === 'quote')) return 'quote'
  const plain = blocks.every((b) => b.kind === 'para') && blocks.length <= 2
  if (BIG.test(title.trim()) && plain) return 'big'
  if (first && plain) return 'title'
  return 'bullets'
}

export function parseSlides(src: string): Deck {
  const slides = splitSlides(src)
    .slice(0, MAX_SLIDES)
    .map((lines, n) => {
      const notes: string[] = []
      const body: string[] = []
      let title = ''
      for (const line of lines) {
        const note = line.match(/^\s*(?:Notes?|Speaker notes?):\s*(.*)$/i)
        const heading = line.match(/^\s*#{1,3}\s+(.*)$/)
        if (note) notes.push(note[1].trim())
        else if (heading && !title) title = heading[1].trim()
        else body.push(line)
      }
      const parsed = { title, blocks: parseBlocks(body), notes }
      return { ...parsed, layout: layoutOf(parsed, n === 0) }
    })
  return { slides }
}

// --- HTML

export const SLIDE_W = 1280
export const SLIDE_H = 720

/** Colours for a deck, read from the app's tokens so slides look like Otty in light and dark. */
export interface SlideTheme {
  bg: string
  surface: string
  text: string
  heading: string
  muted: string
  brand: string
  accent: string
  hairline: string
  font: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** **bold**, *italic* and `code`, on escaped text. Links and pictures stay plain text: a slide never fetches. */
export function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
}

/** Turns a diagram's code into a picture's `data:` address, or null while it can't be drawn. */
export type DiagramPictures = (code: string) => string | null

function blockHtml(b: Block, pictures: DiagramPictures): string {
  switch (b.kind) {
    case 'para':
      return `<p>${inline(b.text)}</p>`
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul'
      return `<${tag}>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${tag}>`
    }
    case 'quote':
      return `<blockquote>${inline(b.text)}</blockquote>`
    case 'diagram': {
      const src = pictures(b.code)
      // Only ever a data: picture, so nothing in a slide can reach the network.
      return src && src.startsWith('data:image/') ? `<img class="diagram" src="${esc(src)}" alt="Diagram">` : '<div class="diagram diagram--missing">Diagram</div>'
    }
    case 'columns':
      return `<div class="columns"><div>${b.left.map((x) => blockHtml(x, pictures)).join('')}</div><div>${b.right.map((x) => blockHtml(x, pictures)).join('')}</div></div>`
  }
}

function slideSection(slide: Slide, n: number, total: number, pictures: DiagramPictures): string {
  const title = slide.title ? `<h1>${inline(slide.title)}</h1>` : ''
  const body = slide.blocks.map((b) => blockHtml(b, pictures)).join('')
  return `<section class="slide slide--${slide.layout}">${title}<div class="body">${body}</div><footer>${n + 1} / ${total}</footer></section>`
}

function css(theme: SlideTheme): string {
  return `
*{box-sizing:border-box;margin:0;padding:0}
@page{size:${SLIDE_W}px ${SLIDE_H}px;margin:0}
html,body{background:${theme.bg};color:${theme.text};font-family:${theme.font};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide{position:relative;width:${SLIDE_W}px;height:${SLIDE_H}px;padding:72px 96px 80px;display:flex;flex-direction:column;gap:32px;overflow:hidden;background:${theme.bg};break-after:page;page-break-after:always}
.slide:last-child{break-after:auto;page-break-after:auto}
.slide::before{content:"";position:absolute;left:96px;top:44px;width:56px;height:6px;border-radius:3px;background:${theme.brand}}
h1{font-size:54px;line-height:1.12;font-weight:700;color:${theme.heading};letter-spacing:-0.01em}
.body{flex:1;min-height:0;display:flex;flex-direction:column;gap:20px;font-size:30px;line-height:1.4}
ul,ol{display:flex;flex-direction:column;gap:14px;padding-left:1.1em}
ul{list-style:none;padding-left:0}
ul>li{position:relative;padding-left:1.1em}
ul>li::before{content:"";position:absolute;left:0.1em;top:0.55em;width:0.36em;height:0.36em;border-radius:50%;background:${theme.brand}}
ol>li::marker{color:${theme.brand};font-weight:700}
strong{color:${theme.heading}}
code{font-family:ui-monospace,Menlo,monospace;font-size:0.85em;background:${theme.surface};border:1px solid ${theme.hairline};padding:2px 8px;border-radius:8px}
blockquote{font-size:40px;line-height:1.3;color:${theme.heading};border-left:6px solid ${theme.accent};padding-left:32px}
footer{position:absolute;right:88px;bottom:32px;height:36px;padding:0 14px;border-radius:18px;display:flex;align-items:center;font-size:16px;font-variant-numeric:tabular-nums;color:${theme.muted};background:${theme.surface};border:1px solid ${theme.hairline}}
.columns{display:grid;grid-template-columns:1fr 1fr;gap:56px;flex:1}
.columns>div{display:flex;flex-direction:column;gap:20px}
.diagram{flex:1;min-height:0;width:100%;object-fit:contain;background:${theme.surface};border:1px solid ${theme.hairline};border-radius:18px;padding:20px;box-shadow:0 12px 32px -20px ${theme.heading}}
.diagram--missing{display:flex;align-items:center;justify-content:center;color:${theme.muted}}
/* D-70: the title slide sits on a soft wash of the brand and straw, with a sun of straw low on the right. */
.slide--title{justify-content:center;background:radial-gradient(90% 120% at 100% 100%,color-mix(in srgb,${theme.brand} 22%,transparent),transparent 62%),linear-gradient(160deg,${theme.bg},color-mix(in srgb,${theme.accent} 20%,${theme.bg}))}
.slide--title::after{content:"";position:absolute;right:-120px;bottom:-160px;width:520px;height:520px;border-radius:50%;background:color-mix(in srgb,${theme.accent} 28%,transparent)}
.slide--title h1{position:relative;z-index:1;font-size:76px;max-width:82%}
.slide--title .body{position:relative;z-index:1;flex:0;font-size:34px;color:${theme.muted};max-width:70%}
.slide--title footer{display:none}
.slide--big{justify-content:center}
.slide--big h1{font-size:180px;line-height:1;color:${theme.brand}}
.slide--big .body{flex:0;font-size:38px}
.slide--quote{justify-content:center}
.slide--quote blockquote{position:relative;border-left:none;padding-left:0;font-size:46px}
.slide--quote blockquote::before{content:"\\201C";position:absolute;left:-12px;top:-120px;font-size:200px;line-height:1;font-family:Georgia,serif;color:color-mix(in srgb,${theme.accent} 70%,transparent)}
`
}

/**
 * A whole document: every slide, one per printed page. `only` draws just that slide (for the thumbnail and the
 * present view). The policy inside means the page can't load or run anything even outside Otty's own CSP.
 */
export function deckHtml(deck: Deck, theme: SlideTheme, pictures: DiagramPictures, only?: number): string {
  const total = deck.slides.length
  const sections = deck.slides.map((s, i) => (only === undefined || only === i ? slideSection(s, i, total, pictures) : '')).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>${css(theme)}</style></head><body>${sections}</body></html>`
}

/** Every diagram's code in a deck, in order, so they can be drawn before the deck is. */
export function deckDiagrams(deck: Deck): string[] {
  const out: string[] = []
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.kind === 'diagram') out.push(b.code)
      if (b.kind === 'columns') walk([...b.left, ...b.right])
    }
  }
  for (const s of deck.slides) walk(s.blocks)
  return out
}

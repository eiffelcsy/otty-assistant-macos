import { cleanMermaid, shortError, svgDataUrl, type DrawingKind } from '../../../shared/drawing'
import { deckDiagrams, deckHtml, parseSlides, type Deck, type SlideTheme } from '../../../shared/slides'
import { sanitizeSvg, svgSize } from './sanitize'

// Turns a drawing block into something to show (D-30). Mermaid is loaded the first time a diagram appears, so
// nobody pays for it until then. Results are cached by their text and theme: a re-render while an answer
// streams, or reopening a chat, doesn't draw them again.

export interface Picture {
  kind: 'picture'
  dataUrl: string
  width: number
  height: number
}

export interface Slides {
  kind: 'slides'
  deck: Deck
  /** One self-contained fragment per slide (styles included), for the card and the bigger view. */
  pages: string[]
  /** The whole deck as one document, for Save as PDF. */
  html: string
}

export type Drawn = Picture | Slides | { kind: 'error'; error: string }

/** The app's own colours, read from its tokens, so drawings look like Otty in light and dark. */
export function theme(): SlideTheme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    bg: v('--bg', 'Canvas'),
    surface: v('--surface', 'Canvas'),
    text: v('--text', 'CanvasText'),
    heading: v('--heading', 'CanvasText'),
    muted: v('--text-2', 'GrayText'),
    brand: v('--brand', 'CanvasText'),
    accent: v('--accent', 'CanvasText'),
    hairline: v('--hairline-strong', 'GrayText'),
    font: v('--font', 'system-ui, sans-serif')
  }
}

type Mermaid = typeof import('mermaid').default
let loading: Promise<Mermaid> | null = null
const loadMermaid = () => (loading ??= import('mermaid').then((m) => m.default))

/** Mermaid draws one diagram at a time. */
let queue: Promise<unknown> = Promise.resolve()
let nextId = 0

async function mermaidSvg(code: string, t: SlideTheme): Promise<string> {
  const mermaid = await loadMermaid()
  const run = queue.then(async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
      maxTextSize: 40_000,
      theme: 'base',
      fontFamily: t.font,
      themeVariables: {
        background: t.bg,
        primaryColor: t.surface,
        primaryTextColor: t.text,
        primaryBorderColor: t.brand,
        secondaryColor: t.surface,
        tertiaryColor: t.surface,
        lineColor: t.muted,
        textColor: t.text,
        mainBkg: t.surface,
        nodeBorder: t.brand,
        clusterBkg: t.bg,
        titleColor: t.heading,
        edgeLabelBackground: t.bg,
        fontFamily: t.font
      }
    })
    const { svg } = await mermaid.render(`otty-drawing-${nextId++}`, cleanMermaid(code))
    return svg
  })
  queue = run.catch(() => {})
  return run
}

function picture(svg: string): Picture | { kind: 'error'; error: string } {
  const clean = sanitizeSvg(svg)
  if (!clean) return { kind: 'error', error: 'it isn’t a picture Otty can draw' }
  return { kind: 'picture', dataUrl: svgDataUrl(clean), ...svgSize(clean) }
}

async function slides(code: string, t: SlideTheme): Promise<Slides | { kind: 'error'; error: string }> {
  const deck = parseSlides(code)
  if (!deck.slides.length) return { kind: 'error', error: 'there were no slides in it' }
  const drawn = new Map<string, string | null>()
  for (const d of deckDiagrams(deck)) {
    if (drawn.has(d)) continue
    try {
      const p = picture(await mermaidSvg(d, t))
      drawn.set(d, p.kind === 'picture' ? p.dataUrl : null)
    } catch {
      drawn.set(d, null) // the slide says "Diagram" rather than failing the whole deck
    }
  }
  const pictures = (c: string) => drawn.get(c) ?? null
  const pages = deck.slides.map((_, i) => deckHtml(deck, t, pictures, i))
  return { kind: 'slides', deck, pages, html: deckHtml(deck, t, pictures) }
}

const cache = new Map<string, Promise<Drawn>>()

export function draw(kind: DrawingKind, code: string): Promise<Drawn> {
  const t = theme()
  const key = `${kind}\u0000${t.bg}\u0000${code}`
  let hit = cache.get(key)
  if (!hit) {
    hit = (async (): Promise<Drawn> => {
      try {
        if (kind === 'svg') return picture(code)
        if (kind === 'mermaid') return picture(await mermaidSvg(code, t))
        return await slides(code, t)
      } catch (err) {
        return { kind: 'error', error: shortError(err) }
      }
    })()
    cache.set(key, hit)
    if (cache.size > 60) cache.delete(cache.keys().next().value!)
  }
  return hit
}

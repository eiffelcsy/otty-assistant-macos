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

/** A deck's colours, plus the chart series and the ink that sits on them (D-70). */
export interface DrawTheme extends SlideTheme {
  series: string[]
  ink: string
}

/** The app's own colours, read from its tokens, so drawings look like Otty in light and dark. */
export function theme(): DrawTheme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    series: [1, 2, 3, 4, 5, 6].map((i) => v(`--chart-${i}`, 'CanvasText')),
    ink: v('--brand-ink', 'Canvas'),
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

async function mermaidSvg(code: string, t: DrawTheme): Promise<string> {
  const mermaid = await loadMermaid()
  const run = queue.then(async () => {
    mermaid.initialize(mermaidConfig(t))
    const { svg } = await mermaid.render(`otty-drawing-${nextId++}`, cleanMermaid(code))
    return svg
  })
  queue = run.catch(() => {})
  return run
}

/** Mermaid's settings: strict, no HTML labels, and Otty's palette for charts and diagrams (D-70). */
export function mermaidConfig(t: DrawTheme) {
  const [c1, c2, c3, c4, c5, c6] = t.series
  const series = { pie1: c1, pie2: c2, pie3: c3, pie4: c4, pie5: c5, pie6: c6, cScale0: c1, cScale1: c2, cScale2: c3, cScale3: c4, cScale4: c5, cScale5: c6 }
  return {
    startOnLoad: false,
    securityLevel: 'strict' as const,
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: 'basis' as const, padding: 16, nodeSpacing: 40, rankSpacing: 48 },
    xyChart: { titleFontSize: 18, xAxis: { tickLength: 0, labelPadding: 8 }, yAxis: { tickLength: 0, labelPadding: 8 } },
    pie: { textPosition: 0.72 },
    suppressErrorRendering: true,
    maxTextSize: 40_000,
    theme: 'base' as const,
    fontFamily: t.font,
    // Rounded boxes and lighter strokes; Mermaid has no variable for either. Bars get the same soft corner.
    themeCSS: '.node rect,.cluster rect{rx:10px;ry:10px;stroke-width:1.25px}.node polygon,.node circle{stroke-width:1.25px}.flowchart-link{stroke-width:1.5px}.bar-plot-0 rect{rx:4px;ry:4px}',
    themeVariables: {
      ...series,
      // Slices and bars sit apart on a hairline of the page's own colour; labels wear text colours, never a series'.
      pieStrokeColor: t.surface,
      pieStrokeWidth: '2px',
      pieOuterStrokeWidth: '0px',
      pieTitleTextColor: t.heading,
      pieLegendTextColor: t.muted,
      pieSectionTextColor: t.ink,
      pieOpacity: '1',
      xyChart: {
        backgroundColor: t.surface,
        titleColor: t.heading,
        plotColorPalette: t.series.join(','),
        xAxisLabelColor: t.muted,
        yAxisLabelColor: t.muted,
        xAxisTitleColor: t.muted,
        yAxisTitleColor: t.muted,
        xAxisLineColor: t.hairline,
        yAxisLineColor: t.hairline,
        xAxisTickColor: t.hairline,
        yAxisTickColor: t.hairline
      },
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
  }
}

function picture(svg: string): Picture | { kind: 'error'; error: string } {
  const clean = sanitizeSvg(svg)
  if (!clean) return { kind: 'error', error: 'it isn’t a picture Otty can draw' }
  return { kind: 'picture', dataUrl: svgDataUrl(clean), ...svgSize(clean) }
}

async function slides(code: string, t: DrawTheme): Promise<Slides | { kind: 'error'; error: string }> {
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

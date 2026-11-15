// Drawings in answers (D-30): which fenced blocks are drawings, and the safe, pure parts of drawing them.
// The model writes text; the renderer draws it locally. A drawing is always shown as a `data:` picture,
// never put into the page, so nothing in it can run, follow a link or load from the internet.

export type DrawingKind = 'mermaid' | 'svg' | 'slides'

/** The fence languages that become drawing cards. */
export function drawingKind(lang: string | null | undefined): DrawingKind | null {
  const l = (lang ?? '').toLowerCase()
  return l === 'mermaid' || l === 'svg' || l === 'slides' ? l : null
}

/** Long enough for any reasonable diagram; past this it's not worth drawing. */
export const MAX_DRAWING_CHARS = 40_000

/**
 * Mermaid source with everything that could change how it's drawn removed: `%%{init}%%` directives (which can
 * try to loosen the config) and `click` lines (links and callbacks). Strict mode would refuse them anyway; this
 * keeps them out of the parser altogether.
 */
export function cleanMermaid(code: string): string {
  return code
    .slice(0, MAX_DRAWING_CHARS)
    .split('\n')
    .filter((l) => !/^\s*%%\{/.test(l) && !/^\s*click\s/i.test(l))
    .join('\n')
    .trim()
}

/** An SVG as a picture address. Browsers never run scripts or fetch anything for an SVG shown this way. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** The first line of a drawing library's error, without its internals, for "Try again". */
export function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  const line = msg.split('\n').find((l) => l.trim()) ?? ''
  return line.replace(/\s+/g, ' ').trim().slice(0, 200) || 'it could not be read'
}

/** The follow-up that "Try again" sends: an ordinary turn, so history and the cache rules are untouched. */
export function retryPrompt(kind: DrawingKind, error: string): string {
  const what = kind === 'slides' ? 'slides' : 'drawing'
  return `The ${what} didn't come out right (${error}). Please send it again, fixed, and keep everything else the same.`
}

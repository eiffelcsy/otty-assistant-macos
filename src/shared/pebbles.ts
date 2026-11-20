import { drawingKind, type DrawingKind } from './drawing'
import type { ChartCard } from './types'

// Pebbles, step 1 (BRAINSTORM, "Pebbles and the Pouch"): what Otty made in an answer, as a thing you can keep. Today
// that's its charts and drawings, wrapped, not rewritten. A Pebble is data Otty draws, never code that runs.

export type PebbleKind = 'chart' | 'deck' | 'diagram' | 'picture'

export interface Pebble {
  kind: PebbleKind
  /** Plain text, shown as text. */
  title: string
  /** What's drawn: a drawing's fence language and its source. */
  drawing: DrawingKind
  code: string
}

export interface KeptPebble extends Pebble {
  chatId: string
  answerId: string
  /** Its place in the answer's `pebblesOf` list. */
  index: number
  kept: number
}

export const KIND_LABELS: Record<PebbleKind, string> = { chart: 'Chart', deck: 'Slides', diagram: 'Diagram', picture: 'Picture' }

const TITLE_MAX = 80

function kindOf(drawing: DrawingKind, code: string): PebbleKind {
  if (drawing === 'slides') return 'deck'
  if (drawing === 'svg') return 'picture'
  return /^\s*(pie|xychart|xychart-beta|quadrantChart)\b/m.test(code) ? 'chart' : 'diagram'
}

/** The sentence before a block says what it shows (prompts.ts asks for it), so it's the title. */
function titleBefore(text: string, kind: PebbleKind): string {
  const sentence = text
    .trimEnd()
    .split('\n')
    .filter((l) => l.trim())
    .at(-1)
    ?.replace(/[*_`#>]/g, '')
    .replace(/:$/, '')
    .trim()
  return sentence ? sentence.slice(0, TITLE_MAX) : KIND_LABELS[kind]
}

/** Every Pebble in an answer, in a fixed order: its charts, then the drawings in its text. Main and the window agree on it. */
export function pebblesOf(answer: { text: string; charts?: ChartCard[] }): Pebble[] {
  const charts = (answer.charts ?? []).map((c): Pebble => ({ kind: 'chart', title: c.title.slice(0, TITLE_MAX) || 'Chart', drawing: 'mermaid', code: c.code }))
  const drawn: Pebble[] = []
  const fence = /^(```|~~~)([\w-]*)[^\n]*\n([\s\S]*?)^\1\s*$/gm
  let last = 0
  for (const m of answer.text.matchAll(fence)) {
    const drawing = drawingKind(m[2])
    if (!drawing) continue
    const code = m[3].replace(/\n$/, '')
    const kind = kindOf(drawing, code)
    drawn.push({ kind, title: titleBefore(answer.text.slice(last, m.index), kind), drawing, code })
    last = m.index + m[0].length
  }
  return [...charts, ...drawn]
}

/** Which Pebble a drawing card is, by its source. -1 for one that isn't there. */
export const pebbleIndex = (answer: { text: string; charts?: ChartCard[] }, code: string): number => pebblesOf(answer).findIndex((p) => p.code.trim() === code.trim())

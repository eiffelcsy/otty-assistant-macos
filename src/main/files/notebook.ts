import { FileError } from './errors'

// Reads a Jupyter notebook (.ipynb, nbformat 4) into one block per cell, with the text outputs and errors kept,
// because that's where "why does this fail?" is answered. Pictures, HTML, widgets and metadata are left out,
// so a notebook full of plots costs no more than its code. No Electron imports: this runs in tests too.

export interface Notebook {
  lang: string
  /** Each cell's text, without its marker: `fitDocument` adds `--- cell 3 · code [7] ---`. */
  cells: NotebookCell[]
}

export interface NotebookCell {
  type: 'code' | 'notes'
  /** The `[7]` a run cell shows. */
  count?: number
  text: string
}

/** Each output is cut to this many characters: a printed dataframe can be enormous. */
export const OUTPUT_CHARS = 2000

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g

const lines = (v: unknown): string => (Array.isArray(v) ? v.join('') : typeof v === 'string' ? v : '')

function cut(s: string): string {
  const t = s.replace(ANSI, '').replace(/\s+$/, '')
  return t.length > OUTPUT_CHARS ? `${t.slice(0, OUTPUT_CHARS)}\n(output shortened)` : t
}

function outputText(o: Record<string, unknown>): string | null {
  switch (o.output_type) {
    case 'stream':
      return cut(lines(o.text))
    case 'execute_result':
    case 'display_data': {
      const data = (o.data ?? {}) as Record<string, unknown>
      if (typeof data['text/plain'] !== 'undefined' || Array.isArray(data['text/plain'])) {
        const plain = cut(lines(data['text/plain']))
        // A plot's text/plain is just "<Figure size 640x480 with 1 Axes>"; say what it is instead.
        if (/^<(?:Figure|matplotlib)[^>]*>$/.test(plain) && Object.keys(data).some((k) => k.startsWith('image/'))) return '[a chart or picture output]'
        return plain
      }
      return Object.keys(data).some((k) => k.startsWith('image/')) ? '[a chart or picture output]' : '[an output Otty can’t show]'
    }
    case 'error': {
      const trace = lines(Array.isArray(o.traceback) ? (o.traceback as unknown[]).join('\n') : '')
      return cut(trace || `${String(o.ename ?? 'Error')}: ${String(o.evalue ?? '')}`)
    }
    default:
      return null
  }
}

export function readNotebook(raw: string): Notebook {
  let nb: Record<string, unknown>
  try {
    nb = JSON.parse(raw)
  } catch {
    throw new FileError('Otty couldn’t open this notebook. It may be damaged.')
  }
  if (!nb || typeof nb !== 'object' || !Array.isArray(nb.cells)) {
    throw new FileError(
      typeof nb?.nbformat === 'number' && nb.nbformat < 4
        ? 'This notebook is in an old format. Open it in Jupyter and save it again, then try once more.'
        : 'Otty couldn’t open this notebook. It may be damaged.'
    )
  }
  const meta = (nb.metadata ?? {}) as { kernelspec?: { language?: string }; language_info?: { name?: string } }
  const name = meta.kernelspec?.language ?? meta.language_info?.name ?? 'python'
  const lang = name.charAt(0).toUpperCase() + name.slice(1)

  const cells: NotebookCell[] = []
  for (const c of nb.cells as Record<string, unknown>[]) {
    const source = lines(c?.source).replace(/\s+$/, '')
    if (c?.cell_type === 'code') {
      const outs = (Array.isArray(c.outputs) ? c.outputs : []).map((o) => outputText(o as Record<string, unknown>)).filter((t): t is string => !!t)
      const text = outs.length ? `${source}\n>>> output:\n${outs.join('\n')}` : source
      if (!text.trim()) continue
      cells.push({ type: 'code', count: typeof c.execution_count === 'number' ? c.execution_count : undefined, text })
    } else if (source.trim()) {
      // markdown and raw cells
      cells.push({ type: 'notes', text: source })
    }
  }
  if (!cells.length) throw new FileError('This notebook looks empty.')
  return { lang, cells }
}

// Tables from the user's own data (D-35): an attached CSV or TSV, or a table highlighted in a spreadsheet, a page or
// a Markdown answer. Pure, so it's tested without a Mac. Only what code reads here becomes a chart's numbers.

export interface Table {
  /** Where it came from, for the model and the card: a file name, or "the highlighted table". */
  source: string
  columns: string[]
  rows: string[][]
}

/** Enough for a year of daily rows many times over, and small enough to add up instantly. */
export const MAX_ROWS = 50_000
const MAX_COLUMNS = 100

/** Splits one CSV line, with "quoted, fields" and "" for a quote. */
function splitCsv(line: string, sep: string): string[] {
  const out: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && !cell.trim()) {
      quoted = true
      cell = ''
    } else if (ch === sep) {
      out.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  out.push(cell.trim())
  return out
}

/** Lines, keeping a quoted field's line breaks inside it. */
function records(text: string): string[] {
  const out: string[] = []
  let line = ''
  let quotes = 0
  for (const part of text.replace(/\r\n?/g, '\n').split('\n')) {
    line = line ? `${line}\n${part}` : part
    quotes += (part.match(/"/g) ?? []).length
    if (quotes % 2 === 0) {
      out.push(line)
      line = ''
      quotes = 0
    }
  }
  if (line) out.push(line)
  return out.filter((l) => l.trim())
}

const pipeRow = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/**
 * A table, or null if this isn't one. Tabs win (that's what a spreadsheet copies), then a Markdown table, then
 * commas or semicolons, whichever splits the first lines evenly. Needs a header and at least two rows.
 */
export function parseTable(text: string, source: string): Table | null {
  const lines = records(text.trim())
  if (lines.length < 3) return null
  let cells: string[][]
  const head = lines.slice(0, 5)
  if (head.every((l) => l.includes('\t'))) cells = lines.map((l) => l.split('\t').map((c) => c.trim()))
  else if (head.every((l) => l.trim().startsWith('|'))) cells = lines.filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l)).map(pipeRow)
  else {
    const sep = [',', ';'].find((s) => {
      const widths = head.map((l) => splitCsv(l, s).length)
      return widths[0] > 1 && widths.every((w) => w === widths[0])
    })
    if (!sep) return null
    cells = lines.map((l) => splitCsv(l, sep))
  }
  const width = cells[0].length
  if (width < 1 || width > MAX_COLUMNS) return null
  const rows = cells.slice(1, MAX_ROWS + 1).filter((r) => r.some(Boolean))
  if (rows.length < 2) return null
  const columns = cells[0].map((c, i) => c || `Column ${i + 1}`)
  return { source, columns, rows: rows.map((r) => columns.map((_, i) => r[i] ?? '')) }
}

/** "$1,234.50", "(12)", "45%", "1 234" → a number, or null. Dates and words are not numbers. */
export function toNumber(cell: string): number | null {
  let s = cell.trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/^[A-Z]{3}\s?|[$€£¥₩₹]|\s?(?:HKD|USD|EUR|GBP)$/gi, '').replace(/%$/, '')
  if (/^-?\d{1,3}(?:[,  ]\d{3})+(?:\.\d+)?$/.test(s)) s = s.replace(/[,  ]/g, '')
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? (negative ? -n : n) : null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** A date written the ways spreadsheets and exports do, as local [year, month (1–12), day], or null. */
export function toDate(cell: string): [number, number, number] | null {
  const s = cell.trim()
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T\s].*)?$/.exec(s)
  if (m) return valid(+m[1], +m[2], m[3] ? +m[3] : 1)
  // Day first, as most of the world writes it. A US file with a day over 12 is caught by `valid`.
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (m) return valid(+m[3], +m[2], +m[1]) ?? valid(+m[3], +m[1], +m[2])
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(s) ?? /^(\d{4})\s+([A-Za-z]{3})[a-z]*$/.exec(s)
  if (m) {
    const [name, year] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]]
    const month = MONTHS.indexOf(name.toLowerCase()) + 1
    return month ? valid(+year, month, 1) : null
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(s) ?? /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)
  if (m) {
    const [day, name] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]
    const month = MONTHS.indexOf(name.toLowerCase()) + 1
    return month ? valid(+m[3], month, +day) : null
  }
  return null
}

function valid(y: number, mo: number, d: number): [number, number, number] | null {
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return null
  return d <= new Date(y, mo, 0).getDate() ? [y, mo, d] : null
}

/** A table highlighted or attached in this message, if there is one. Masked text in, so no key can become a label. */
export function tablesIn(parts: { text: string; source: string }[]): Table[] {
  return parts.flatMap((p) => {
    const t = parseTable(p.text, p.source)
    return t ? [t] : []
  })
}

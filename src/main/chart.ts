import type { ChartCard } from '../shared/types'
import { toDate, toNumber, type Table } from '../shared/table'

// Charts from data (D-35). The model only says what to chart: which columns, how to add them up, what kind. Every
// number is worked out here from the user's rows, and the model is handed the same numbers to write about, so the
// chart and the words agree. The Mermaid is written here too, with labels quoted, so nothing the data holds can
// become part of the diagram's code.

export type ChartKind = 'bar' | 'line' | 'pie'
export type Measure = 'sum' | 'count' | 'mean' | 'min' | 'max'
export type GroupBy = 'value' | 'day' | 'month' | 'year'

export interface ChartSpec {
  kind: ChartKind
  /** The column the bars or slices are. */
  x: number
  /** The column of numbers. Absent, rows are counted. */
  y?: number
  measure: Measure
  by: GroupBy
  title: string
  /** Most bars or slices to show; the rest are left out (bars) or become "Other" (slices). */
  top: number
}

export interface Series {
  labels: string[]
  values: number[]
  /** Rows left out because the column wasn't a number or a date there. */
  skipped: number
  /** Groups beyond `top`. */
  hidden: number
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A column by name, ignoring case and spaces, or by a plain number from 1. */
export function columnOf(table: Table, name: unknown): number | undefined {
  if (typeof name !== 'string' && typeof name !== 'number') return undefined
  const want = String(name).trim().toLowerCase().replace(/\s+/g, ' ')
  const at = table.columns.findIndex((c) => c.trim().toLowerCase().replace(/\s+/g, ' ') === want)
  if (at >= 0) return at
  const n = Number(want)
  return Number.isInteger(n) && n >= 1 && n <= table.columns.length ? n - 1 : undefined
}

/** The model's arguments, checked. Words for the model when they don't fit the table. */
export function chartSpec(table: Table, args: Record<string, unknown>): ChartSpec | string {
  const kind: ChartKind = args.chart === 'line' || args.chart === 'pie' ? args.chart : 'bar'
  const x = columnOf(table, args.x)
  if (x === undefined) return `There's no column called “${String(args.x ?? '')}”. The columns are: ${table.columns.join(', ')}.`
  const y = args.y === undefined || args.y === null || args.y === '' ? undefined : columnOf(table, args.y)
  if (args.y && y === undefined) return `There's no column called “${String(args.y)}”. The columns are: ${table.columns.join(', ')}.`
  const measure: Measure = y === undefined ? 'count' : (['sum', 'count', 'mean', 'min', 'max'] as const).find((m) => m === args.measure) ?? 'sum'
  const by: GroupBy = (['day', 'month', 'year'] as const).find((b) => b === args.by) ?? 'value'
  const top = Math.min(Math.max(Math.floor(Number(args.top) || (kind === 'pie' ? 6 : 12)), 2), kind === 'pie' ? 10 : 40)
  const title = String(args.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || defaultTitle(table, x, y, measure)
  return { kind, x, ...(y !== undefined ? { y } : {}), measure, by, title, top }
}

function defaultTitle(table: Table, x: number, y: number | undefined, measure: Measure): string {
  if (y === undefined) return `Rows by ${table.columns[x]}`
  return `${measure === 'sum' ? 'Total' : measure === 'mean' ? 'Average' : capital(measure)} ${table.columns[y]} by ${table.columns[x]}`
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Two decimals at most, and no "0.30000000000000004". */
const tidy = (n: number) => Math.round(n * 100) / 100

/** Adds the rows up. Dates group in order of time, other labels by size (or first seen, for a line). */
export function aggregate(table: Table, spec: ChartSpec): Series {
  const groups = new Map<string, { label: string; sort: number; n: number; sum: number; min: number; max: number }>()
  let skipped = 0
  let order = 0
  for (const row of table.rows) {
    const raw = row[spec.x] ?? ''
    let key: string
    let label: string
    let sort: number
    if (spec.by === 'value') {
      key = raw.trim() || '(blank)'
      label = key
      sort = order++
    } else {
      const d = toDate(raw)
      if (!d) {
        skipped++
        continue
      }
      const [y, m, day] = d
      if (spec.by === 'year') [key, label, sort] = [`${y}`, `${y}`, y]
      else if (spec.by === 'month') [key, label, sort] = [`${y}-${m}`, `${MONTH_NAMES[m - 1]} ${y}`, y * 100 + m]
      else [key, label, sort] = [`${y}-${m}-${day}`, `${day} ${MONTH_NAMES[m - 1]} ${y}`, y * 10_000 + m * 100 + day]
    }
    let value = 1
    if (spec.y !== undefined) {
      const n = toNumber(row[spec.y] ?? '')
      if (n === null) {
        skipped++
        continue
      }
      value = n
    }
    const g = groups.get(key) ?? { label, sort, n: 0, sum: 0, min: Infinity, max: -Infinity }
    g.n++
    g.sum += value
    g.min = Math.min(g.min, value)
    g.max = Math.max(g.max, value)
    groups.set(key, g)
  }

  const value = (g: { n: number; sum: number; min: number; max: number }) =>
    spec.measure === 'count' ? g.n : spec.measure === 'mean' ? g.sum / g.n : spec.measure === 'min' ? g.min : spec.measure === 'max' ? g.max : g.sum
  let list = [...groups.values()].map((g) => ({ label: g.label, sort: g.sort, value: value(g), g }))
  if (spec.by !== 'value') list.sort((a, b) => a.sort - b.sort)
  else if (spec.kind !== 'line') list.sort((a, b) => b.value - a.value)

  let hidden = 0
  if (list.length > spec.top) {
    hidden = list.length - spec.top
    if (spec.kind === 'pie' && (spec.measure === 'sum' || spec.measure === 'count')) {
      const rest = list.slice(spec.top - 1)
      list = [...list.slice(0, spec.top - 1), { label: 'Other', sort: Infinity, value: rest.reduce((n, r) => n + r.value, 0), g: rest[0].g }]
      hidden = 0
    } else list = spec.by === 'value' ? list.slice(0, spec.top) : list.slice(-spec.top)
  }
  return { labels: list.map((l) => l.label), values: list.map((l) => tidy(l.value)), skipped, hidden }
}

/** A label or title, safe inside Mermaid's double quotes. */
const quoted = (s: string) => `"${s.replace(/["\\`#;%{}<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || ' '}"`

export function mermaidFor(spec: ChartSpec, series: Series, yName: string): string {
  if (spec.kind === 'pie') {
    return [`pie showData`, `  title ${quoted(spec.title)}`, ...series.labels.map((l, i) => `  ${quoted(l)} : ${Math.max(0, series.values[i])}`)].join('\n')
  }
  const lo = Math.min(0, ...series.values)
  const hi = Math.max(...series.values, 0)
  return [
    'xychart-beta',
    `  title ${quoted(spec.title)}`,
    `  x-axis [${series.labels.map(quoted).join(', ')}]`,
    `  y-axis ${quoted(yName)} ${tidy(lo)} --> ${tidy(hi === lo ? lo + 1 : hi * 1.1)}`,
    `  ${spec.kind === 'line' ? 'line' : 'bar'} [${series.values.join(', ')}]`
  ].join('\n')
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function markdownTable(xName: string, yName: string, series: Series): string {
  return [`| ${cell(xName)} | ${cell(yName)} |`, '| --- | ---: |', ...series.labels.map((l, i) => `| ${cell(l)} | ${series.values[i].toLocaleString('en')} |`)].join('\n')
}

export interface Built {
  card: ChartCard
  /** For the model: the numbers to use, and only these. */
  result: string
}

/** The whole step: check the request, add up the rows, draw it and say what came out. */
export function buildChart(table: Table, args: Record<string, unknown>): Built | string {
  const spec = chartSpec(table, args)
  if (typeof spec === 'string') return spec
  const series = aggregate(table, spec)
  if (series.labels.length < (spec.kind === 'pie' ? 2 : 1)) {
    return spec.y !== undefined
      ? `Nothing to chart: “${table.columns[spec.y]}” has no numbers${spec.by !== 'value' ? ` next to dates in “${table.columns[spec.x]}”` : ''}.`
      : `Nothing to chart: “${table.columns[spec.x]}” has no ${spec.by === 'value' ? 'values' : 'dates'}.`
  }
  const xName = spec.by === 'value' ? table.columns[spec.x] : capital(spec.by)
  const yName = spec.y === undefined ? 'Rows' : spec.measure === 'sum' ? table.columns[spec.y] : `${capital(spec.measure)} ${table.columns[spec.y]}`
  const numbers = markdownTable(xName, yName, series)
  // A total is the next thing anyone asks, and only means something when the groups add up to the whole.
  const total = (spec.measure === 'sum' || spec.measure === 'count') && !series.hidden ? tidy(series.values.reduce((n, v) => n + v, 0)) : null
  const notes = [
    series.skipped ? `${series.skipped} ${series.skipped === 1 ? 'row was' : 'rows were'} left out because ${spec.by === 'value' ? 'the number was missing' : 'the date or number was missing'}.` : '',
    series.hidden ? `Only the ${spec.by === 'value' ? 'largest' : 'latest'} ${series.labels.length} are shown; ${series.hidden} more were left out.` : ''
  ].filter(Boolean)
  return {
    card: { title: spec.title, code: mermaidFor(spec, series, yName), table: numbers },
    result: [
      `The chart is shown to the user under your answer. Otty worked these numbers out from ${table.rows.length} rows of ${table.source}:`,
      numbers,
      total !== null ? `All together: ${total.toLocaleString('en')}.` : '',
      notes.join(' '),
      'Write about the chart using only these numbers, and don’t draw it again. Anything worked out from them (a gap, a share, a change) needs calculate, like any other sum.'
    ]
      .filter(Boolean)
      .join('\n\n')
  }
}

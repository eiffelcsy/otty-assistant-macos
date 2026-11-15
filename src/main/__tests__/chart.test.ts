import { describe, expect, it } from 'vitest'
import { parseTable, toDate, toNumber } from '../../shared/table'
import { aggregate, buildChart, chartSpec, mermaidFor, type ChartSpec } from '../chart'

const csv = (rows: string[][]) => rows.map((r) => r.join(',')).join('\n')

/** 500 sales over 2026, with a seeded pseudo-random spread so the totals aren't round. */
function sales() {
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const rows: string[][] = []
  const pivot = new Map<string, number>()
  for (let i = 0; i < 500; i++) {
    const month = 1 + Math.floor(rand() * 12)
    const day = 1 + Math.floor(rand() * 28)
    const amount = Math.round(rand() * 50_000) / 100
    const region = ['North', 'South', 'East'][i % 3]
    rows.push([`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, region, `"$${amount.toLocaleString('en', { minimumFractionDigits: 2 })}"`])
    pivot.set(String(month), (pivot.get(String(month)) ?? 0) + amount)
  }
  return { text: csv([['Date', 'Region', 'Sales'], ...rows]), pivot }
}

describe('reading a table (D-35)', () => {
  it('reads a CSV with quoted commas and a header', () => {
    const t = parseTable('Name,Notes,Amount\nAda,"likes tea, and cake",12\nBo,"said ""hi""",3', 'people.csv')!
    expect(t.columns).toEqual(['Name', 'Notes', 'Amount'])
    expect(t.rows).toEqual([
      ['Ada', 'likes tea, and cake', '12'],
      ['Bo', 'said "hi"', '3']
    ])
  })

  it('reads what a spreadsheet copies (tabs), and a Markdown table', () => {
    expect(parseTable('Month\tSales\nJan\t10\nFeb\t20', 'the highlighted table')?.rows).toHaveLength(2)
    const md = parseTable('| Fruit | Count |\n| --- | ---: |\n| Apple | 3 |\n| Pear | 5 |', 'x')!
    expect(md.columns).toEqual(['Fruit', 'Count'])
    expect(md.rows).toEqual([
      ['Apple', '3'],
      ['Pear', '5']
    ])
  })

  it('isn’t fooled by prose', () => {
    expect(parseTable('Hello there, how are you?\nI am fine, thanks.\nGood.', 'x')).toBeNull()
    expect(parseTable('just one line', 'x')).toBeNull()
  })

  it('reads numbers the way people write them', () => {
    expect(toNumber('$1,234.50')).toBe(1234.5)
    expect(toNumber('(12)')).toBe(-12)
    expect(toNumber('45%')).toBe(45)
    expect(toNumber('HKD 300')).toBe(300)
    expect(toNumber('2026-01-02')).toBeNull()
    expect(toNumber('twelve')).toBeNull()
  })

  it('reads dates the way exports write them', () => {
    expect(toDate('2026-03-04')).toEqual([2026, 3, 4])
    expect(toDate('2026-03-04T10:00:00Z')).toEqual([2026, 3, 4])
    expect(toDate('04/03/2026')).toEqual([2026, 3, 4])
    expect(toDate('12/25/2026')).toEqual([2026, 12, 25])
    expect(toDate('Mar 2026')).toEqual([2026, 3, 1])
    expect(toDate('4 March 2026')).toEqual([2026, 3, 4])
    expect(toDate('2026-02-30')).toBeNull()
    expect(toDate('soon')).toBeNull()
  })
})

describe('charting it', () => {
  it('a 500-row CSV by month matches a pivot table to the cent', () => {
    const { text, pivot } = sales()
    const table = parseTable(text, 'sales.csv')!
    expect(table.rows).toHaveLength(500)
    const spec = chartSpec(table, { chart: 'bar', x: 'date', y: 'Sales', by: 'month' }) as ChartSpec
    const series = aggregate(table, spec)
    expect(series.labels[0]).toBe('Jan 2026')
    expect(series.labels).toHaveLength(12)
    series.labels.forEach((label, i) => {
      const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(label.slice(0, 3)) + 1
      expect(series.values[i]).toBeCloseTo(pivot.get(String(month))!, 2)
    })
    expect(series.skipped).toBe(0)
  })

  it('hands the model the same numbers the chart shows', () => {
    const table = parseTable('Region,Sales\nNorth,10\nSouth,5\nNorth,2.5\nEast,1', 't.csv')!
    const built = buildChart(table, { chart: 'bar', x: 'Region', y: 'Sales' })
    if (typeof built === 'string') throw new Error(built)
    expect(built.card.code).toContain('bar [12.5, 5, 1]')
    expect(built.result).toContain('| North | 12.5 |')
    expect(built.result).toMatch(/using only these numbers/)
    expect(built.card.table).toBe('| Region | Sales |\n| --- | ---: |\n| North | 12.5 |\n| South | 5 |\n| East | 1 |')
  })

  it('counts rows when there’s no number column, and folds small slices into Other', () => {
    const rows = ['Fruit', ...'apple apple pear fig kiwi plum lime date apple pear'.split(' ')].join('\n')
    const table = parseTable(rows.replace(/\n/g, ',1\n').replace(/^Fruit,1/, 'Fruit,n') + ',1', 'f.csv')!
    const built = buildChart(table, { chart: 'pie', x: 'Fruit', top: 3 })
    if (typeof built === 'string') throw new Error(built)
    expect(built.card.code).toMatch(/^pie showData/)
    expect(built.card.code).toContain('"apple" : 3')
    expect(built.card.code).toContain('"Other" : 5')
  })

  it('says plainly when a column isn’t there', () => {
    const table = parseTable('a,b\n1,2\n3,4', 't.csv')!
    expect(buildChart(table, { chart: 'bar', x: 'month' })).toMatch(/no column called “month”. The columns are: a, b/)
  })

  it('keeps what the data says out of the diagram’s code', () => {
    const table = parseTable('Name,Sales\n"x""]\nclick A call evil()",3\nB;%%{init},4', 't.csv')!
    const spec = chartSpec(table, { chart: 'bar', x: 'Name', y: 'Sales' }) as ChartSpec
    const code = mermaidFor(spec, aggregate(table, spec), 'Sales')
    const axis = code.split('\n').find((l) => l.includes('x-axis'))!
    expect(code.split('\n')).toHaveLength(5)
    // Each label is one quoted string with nothing that could close it or start a directive or comment.
    expect(axis).toMatch(/^ {2}x-axis \[(?:"[^"%;{}]*"(?:, )?)+\]$/)
    expect(code).not.toContain('%%')
  })
})

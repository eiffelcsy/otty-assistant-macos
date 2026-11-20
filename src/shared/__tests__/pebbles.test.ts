import { describe, expect, it } from 'vitest'
import { pebbleIndex, pebblesOf } from '../pebbles'

const answer = {
  text: [
    'Here is how it flows:',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    'And **your spending** by kind:',
    '```mermaid',
    'pie',
    '  "Rent": 1200',
    '```',
    '```python',
    'print(1)',
    '```',
    '```slides',
    '# Hi',
    '```'
  ].join('\n'),
  charts: [{ title: 'Sales by month', code: 'xychart-beta\n bar [1, 2]', table: '' }]
}

describe('Pebbles in an answer (step 1)', () => {
  it('lists charts first, then drawings in order, each with a kind and a plain title', () => {
    expect(pebblesOf(answer).map((p) => [p.kind, p.title])).toEqual([
      ['chart', 'Sales by month'],
      ['diagram', 'Here is how it flows'],
      ['chart', 'And your spending by kind'],
      ['deck', 'Slides']
    ])
  })

  it('finds a card by its source, and nothing for code that isn’t a drawing', () => {
    expect(pebbleIndex(answer, 'pie\n  "Rent": 1200\n')).toBe(2)
    expect(pebbleIndex(answer, 'print(1)')).toBe(-1)
  })
})

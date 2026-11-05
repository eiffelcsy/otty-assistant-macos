import { describe, expect, it } from 'vitest'
import { rowsOf, rowsText } from '../readingOrder'
import type { OcrLine } from '../types'

const line = (text: string, x: number, y: number, h = 0.1): OcrLine => ({ text, box: { x, y, w: 0.1, h } })
const texts = (lines: OcrLine[]) => rowsOf(lines).map((row) => row.map((l) => l.text))

describe('rowsOf', () => {
  it('turns a table read column by column into rows', () => {
    const columns = [line('Item', 0, 0.1), line('Pears', 0, 0.4), line('Price', 0.5, 0.1), line('12.00', 0.5, 0.4)]
    expect(texts(columns)).toEqual([
      ['Item', 'Price'],
      ['Pears', '12.00']
    ])
  })

  it('keeps cells together when their boxes sit slightly apart', () => {
    expect(texts([line('b', 0.5, 0.13), line('a', 0, 0.1)])).toEqual([['a', 'b']])
  })

  it('keeps lines of a paragraph apart', () => {
    expect(texts([line('two', 0, 0.22), line('one', 0, 0.1)])).toEqual([['one'], ['two']])
  })

  it('compares a small line with a tall one fairly', () => {
    expect(texts([line('tall', 0, 0.1, 0.3), line('small', 0, 0.42, 0.05)])).toEqual([['tall'], ['small']])
  })

  it('handles a picture with no words', () => {
    expect(rowsOf([])).toEqual([])
  })

  it('leaves the lines it was given alone', () => {
    const lines = [line('b', 0, 0.5), line('a', 0, 0.1)]
    rowsOf(lines)
    expect(lines[0].text).toBe('b')
  })
})

describe('rowsText', () => {
  it('puts tabs between cells and new lines between rows', () => {
    expect(
      rowsText([
        ['Item', 'Price'],
        ['Pears', '']
      ])
    ).toBe('Item\tPrice\nPears\t')
  })
})

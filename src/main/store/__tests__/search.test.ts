import { describe, expect, it } from 'vitest'
import { findRanges, makeSnippet, parseQuery, plainText } from '../search'

describe('parseQuery', () => {
  it('splits on spaces, folds case and width, and drops repeats', () => {
    expect(parseQuery('  Otter  OTTER ＰＤＦ ')).toEqual(['otter', 'pdf'])
  })

  it('keeps quoted phrases, in straight, curly or corner quotes', () => {
    expect(parseQuery('"hold  paws" raft')).toEqual(['hold paws', 'raft'])
    expect(parseQuery('“save as pdf”')).toEqual(['save as pdf'])
    expect(parseQuery('「打印 機」')).toEqual(['打印 機'])
    expect(parseQuery('"unclosed phrase')).toEqual(['unclosed phrase'])
  })
})

describe('plainText', () => {
  it('keeps what a reader sees', () => {
    expect(plainText('Hit [rate limiting](#explain) **fast**.')).toBe('Hit rate limiting fast.')
    expect(plainText('> 💡 **Good to know:** wait\n1. One\n- Two\n## Head')).toBe('💡 Good to know: wait\nOne\nTwo\nHead')
    expect(plainText('use `=SUM()` or *maybe* not 2*3*4')).toBe('use =SUM() or maybe not 2*3*4')
  })
})

describe('findRanges', () => {
  it('maps matches back to the original text through case and width folding', () => {
    const text = 'Save as ＰＤＦ, then PDF again'
    const ranges = findRanges(text, ['pdf'])
    expect(ranges.map(([s, e]) => text.slice(s, e))).toEqual(['ＰＤＦ', 'PDF'])
  })

  it('merges overlapping terms', () => {
    expect(findRanges('otters', ['otter', 'ters'])).toEqual([[0, 6]])
  })

  it('handles emoji and Chinese', () => {
    const text = '💡 按「Print」（打印）'
    const [[s, e]] = findRanges(text, ['打印'])
    expect(text.slice(s, e)).toBe('打印')
  })
})

describe('makeSnippet', () => {
  it('centres a long text on the first match, with ellipses', () => {
    const text = 'word '.repeat(40) + 'needle ' + 'word '.repeat(40)
    const { text: snip, ranges } = makeSnippet(text.trim(), ['needle'])
    expect(snip.startsWith('…')).toBe(true)
    expect(snip.endsWith('…')).toBe(true)
    expect(snip.length).toBeLessThanOrEqual(125)
    expect(ranges.map(([s, e]) => snip.slice(s, e))).toEqual(['needle'])
  })

  it('shows short text whole', () => {
    expect(makeSnippet('Do otters hold hands?', ['hold'])).toEqual({ text: 'Do otters hold hands?', ranges: [[10, 14]] })
  })
})

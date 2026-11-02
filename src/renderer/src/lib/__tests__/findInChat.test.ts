import { describe, expect, it } from 'vitest'
import { matchTexts } from '../findInChat'

describe('matchTexts', () => {
  it('finds every term in one text, in reading order', () => {
    expect(matchTexts(['Save before you print. Then print again.'], 'print save')).toEqual([
      [
        [0, 0],
        [0, 4]
      ],
      [
        [0, 16],
        [0, 21]
      ],
      [
        [0, 28],
        [0, 33]
      ]
    ])
  })

  it('follows a match across text nodes, like bold inside a sentence', () => {
    // "Open the **File** menu" renders as three text nodes.
    expect(matchTexts(['Open the ', 'File', ' menu'], '"the file menu"')).toEqual([
      [
        [0, 5],
        [2, 5]
      ]
    ])
  })

  it('ends a match at the end of its own node, not the start of the next', () => {
    expect(matchTexts(['File', ' menu'], 'file')).toEqual([
      [
        [0, 0],
        [0, 4]
      ]
    ])
  })

  it('matches Chinese and full-width text without spaces', () => {
    expect(matchTexts(['打印之前，請先儲存檔案。'], '打印')).toEqual([
      [
        [0, 0],
        [0, 2]
      ]
    ])
    expect(matchTexts(['Ｗｉ-Ｆｉ password'], 'wi-fi')).toEqual([
      [
        [0, 0],
        [0, 5]
      ]
    ])
  })

  it('finds nothing for an empty query', () => {
    expect(matchTexts(['anything'], '  ')).toEqual([])
    expect(matchTexts([], 'x')).toEqual([])
  })
})

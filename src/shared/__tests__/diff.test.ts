import { describe, expect, it } from 'vitest'
import { withoutFixedFence, wordDiff } from '../diff'

const marks = (before: string, after: string) =>
  wordDiff(before, after)
    ?.filter((p) => p.kind !== 'same')
    .map((p) => `${p.kind === 'added' ? '+' : '-'}${p.text}`)

describe('wordDiff', () => {
  it('marks only the words that changed', () => {
    expect(marks('She go to school yesterday', 'She went to school yesterday')).toEqual(['-go', '+went'])
  })

  it('finds several separate fixes', () => {
    expect(marks('I has two cat and he are nice', 'I have two cats and he is nice')).toEqual(['-has', '+have', '-cat', '+cats', '-are', '+is'])
  })

  it('marks nothing when nothing changed', () => {
    expect(marks('All good here.', 'All good here.')).toEqual([])
  })

  it('compares Chinese character by character', () => {
    expect(marks('我今天去学校', '我今天去學校')).toEqual(['-学', '+學'])
  })

  it('handles words added and removed', () => {
    expect(marks('Thanks you', 'Thank you very much')).toEqual(['-Thanks', '+Thank', '+ very much'])
  })

  it('rebuilds both texts exactly', () => {
    const before = 'One two,  three.\nFour'
    const after = 'One too, three!\n\nFour five'
    const parts = wordDiff(before, after)!
    expect(parts.filter((p) => p.kind !== 'added').map((p) => p.text).join('')).toBe(before)
    expect(parts.filter((p) => p.kind !== 'removed').map((p) => p.text).join('')).toBe(after)
  })

  it('gives up on long text, rather than freezing', () => {
    expect(wordDiff('a'.repeat(4_001), 'b')).toBeNull()
  })

  it('stays quick at the limit', () => {
    const text = 'word '.repeat(800)
    const started = Date.now()
    expect(wordDiff(text, text.replace('word', 'bird'))).not.toBeNull()
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('withoutFixedFence', () => {
  it('leaves the text and the reasons', () => {
    expect(withoutFixedFence('```fixed\nHello there.\n```\n\n- A reason')).toBe('Hello there.\n\n- A reason')
  })

  it('leaves other code alone', () => {
    const code = '```js\nlet a\n```'
    expect(withoutFixedFence(code)).toBe(code)
  })
})

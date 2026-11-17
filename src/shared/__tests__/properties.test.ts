// D-48: properties of the pure parsers and guards, over many generated inputs, so a test can't just restate the code.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { wordDiff } from '../diff'
import { findRanges, fold, parseQuery } from '../match'
import { firstRun, nextRun, readRepeat, type Repeat } from '../repeat'
import { HIDDEN, maskSecrets } from '../secrets'
import { parseTable, toDate, toNumber } from '../table'

const count = (text: string, part: string) => text.split(part).length - 1
const lower = fc.string({ unit: fc.constantFrom(...'abcdefghij klmnopqrstuvwxyz'.split('')), maxLength: 120 })
/** Text with keys, names, quotes and separators: the characters the secret shapes care about. */
const keyish = fc.string({ unit: fc.constantFrom(...'aZ09_-=:"\' .\n/@sk-AKIAghp_xoxb-eyJBearer'.split('')), maxLength: 200 })
const key = fc.string({ unit: fc.constantFrom(...'ABCDEFabcdef0123456789'.split('')), minLength: 20, maxLength: 48 })

describe('maskSecrets', () => {
  it('leaves plain words alone', () => {
    fc.assert(
      fc.property(lower, (text) => {
        expect(maskSecrets(text)).toEqual({ text, hidden: 0 })
      })
    )
  })

  it('never lets an sk- key through, wherever it sits', () => {
    fc.assert(
      fc.property(lower, key, lower, (before, k, after) => {
        const out = maskSecrets(`${before} sk-${k} ${after}`)
        expect(out.text).not.toContain(k)
        expect(out.hidden).toBeGreaterThan(0)
      })
    )
  })

  it('counts exactly what it hides, and masking twice changes nothing more', () => {
    fc.assert(
      fc.property(keyish, (text) => {
        fc.pre(!text.includes(HIDDEN))
        const once = maskSecrets(text)
        expect(count(once.text, HIDDEN)).toBe(once.hidden)
        expect(maskSecrets(once.text)).toEqual({ text: once.text, hidden: 0 })
      })
    )
  })
})

describe('wordDiff', () => {
  const words = fc.string({ unit: fc.constantFrom('a', 'b', ' ', '.', '海', '獺', 'é', '\n'), maxLength: 80 })
  it('rebuilds both texts from its parts', () => {
    fc.assert(
      fc.property(words, words, (before, after) => {
        const parts = wordDiff(before, after)!
        expect(parts.filter((p) => p.kind !== 'added').map((p) => p.text).join('')).toBe(before)
        expect(parts.filter((p) => p.kind !== 'removed').map((p) => p.text).join('')).toBe(after)
      })
    )
  })
})

describe('find ranges', () => {
  const text = fc.string({ unit: fc.constantFrom('a', 'B', 'c', ' ', 'ﬁ', 'İ', 'é', 'é', '👍🏽'), maxLength: 60 })
  it('gives sorted, separate ranges inside the text, each one matching a term once folded', () => {
    fc.assert(
      fc.property(text, fc.array(fc.constantFrom('a', 'b c', 'fi', 'é', 'cc'), { maxLength: 3 }), (t, terms) => {
        const ranges = findRanges(t, terms)
        let end = -1
        for (const [s, e] of ranges) {
          expect(s).toBeGreaterThan(end)
          expect(e).toBeLessThanOrEqual(t.length)
          expect(terms.some((term) => fold(t.slice(s, e)).includes(term))).toBe(true)
          end = e
        }
      })
    )
  })

  it('finds a word that is in the text', () => {
    fc.assert(
      fc.property(lower, lower, fc.stringMatching(/^[a-z]{1,8}$/), (a, b, word) => {
        expect(findRanges(`${a}${word}${b}`, [word]).length).toBeGreaterThan(0)
      })
    )
  })

  it('splits a query into unique, trimmed terms', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (q) => {
        const terms = parseQuery(q)
        expect(new Set(terms).size).toBe(terms.length)
        for (const t of terms) expect(t).toBe(t.trim())
        for (const t of terms) expect(t).not.toBe('')
      })
    )
  })
})

describe('tables', () => {
  it('reads back every whole number written with or without thousands commas', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }), (n) => {
        expect(toNumber(String(n))).toBe(n)
        expect(toNumber(n.toLocaleString('en-US'))).toBe(n)
      })
    )
  })

  it('reads back every real ISO date, and refuses impossible ones', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1900, max: 2200 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }), (y, m, d) => {
        const real = d <= new Date(y, m, 0).getDate()
        expect(toDate(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)).toEqual(real ? [y, m, d] : null)
      })
    )
  })

  it('reads a CSV it was given back as the same cells', () => {
    const cell = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 .]{0,10}[A-Za-z0-9]$/)
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), fc.integer({ min: 2, max: 6 }), (width, height) => {
        const grid = fc.sample(fc.array(fc.array(cell, { minLength: width, maxLength: width }), { minLength: height + 1, maxLength: height + 1 }), 1)[0]
        const csv = grid.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
        expect(parseTable(csv, 'x')).toEqual({ source: 'x', columns: grid[0], rows: grid.slice(1) })
      })
    )
  })
})

describe('repeats', () => {
  const repeat: fc.Arbitrary<Repeat> = fc.oneof(
    fc.constant({ every: 'day' as const }),
    fc.constant({ every: 'weekday' as const }),
    fc.integer({ min: 0, max: 6 }).map((day) => ({ every: 'week' as const, day }))
  )
  const time = fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 0, 1) })
  const fits = (r: Repeat, d: Date) => (r.every === 'day' ? true : r.every === 'weekday' ? d.getDay() >= 1 && d.getDay() <= 5 : d.getDay() === r.day)

  it('always moves on: after `after`, on a right day, at the series’ time, within a week', () => {
    fc.assert(
      fc.property(repeat, time, time, (r, timeOf, after) => {
        const next = new Date(nextRun(r, timeOf, after))
        expect(next.getTime()).toBeGreaterThan(after)
        expect(next.getTime() - after).toBeLessThanOrEqual(8 * 86_400_000)
        expect(fits(r, next)).toBe(true)
        expect(next.getMinutes()).toBe(new Date(timeOf).getMinutes())
      })
    )
  })

  it('starts on a right day', () => {
    fc.assert(
      fc.property(repeat, time, (r, at) => {
        expect(fits(r, new Date(firstRun(r, at)))).toBe(true)
      })
    )
  })

  it('reads anything saved as one of the three repeats, or none, never something wider', () => {
    fc.assert(
      fc.property(fc.oneof(fc.json(), fc.string()), (json) => {
        const r = readRepeat(json)
        if (r === null) return
        if (r.every === 'week') expect(Number.isInteger(r.day) && r.day >= 0 && r.day <= 6).toBe(true)
        else expect(Object.keys(r)).toEqual(['every'])
      })
    )
  })
})

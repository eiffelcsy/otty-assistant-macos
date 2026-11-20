// D-72: the cove follows the Mac's clock and appearance, with one timer to the next painting.
import { describe, expect, it } from 'vitest'
import { coveTime, untilNextCove } from '../cove'

const at = (h: number, m = 0) => new Date(2026, 10, 21, h, m)

describe('the cove', () => {
  it('picks the painting by hour, and night in dark mode', () => {
    expect([4, 5, 7, 8, 16, 17, 18, 19, 23].map((h) => coveTime(at(h), false))).toEqual(['night', 'dawn', 'dawn', 'day', 'day', 'golden', 'golden', 'night', 'night'])
    expect(coveTime(at(12), true)).toBe('night')
  })

  it('waits until the next painting starts, past midnight too', () => {
    expect(untilNextCove(at(7, 30))).toBe(30 * 60_000)
    expect(untilNextCove(at(19))).toBe(10 * 3.6e6)
    expect(untilNextCove(at(2))).toBe(3 * 3.6e6)
  })
})

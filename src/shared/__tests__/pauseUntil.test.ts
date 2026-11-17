import { describe, expect, it } from 'vitest'
import { cleanPauseEnd, pauseEnd } from '../pauseUntil'

const now = new Date(2026, 10, 17, 14, 30).getTime()

describe('pause until (D-39)', () => {
  it('ends an hour from now, tomorrow at 9, or not by itself', () => {
    expect(pauseEnd('hour', now)).toBe(now + 3600_000)
    expect(new Date(pauseEnd('morning', now)!)).toEqual(new Date(2026, 10, 18, 9, 0))
    expect(pauseEnd('manual', now)).toBeNull()
  })

  it('keeps only an end that is ahead and within two days', () => {
    expect(cleanPauseEnd(now + 60_000, now)).toBe(now + 60_000)
    for (const bad of [now - 1, now, now + 3 * 86_400_000, '9', NaN, null, undefined]) expect(cleanPauseEnd(bad, now)).toBeNull()
  })
})

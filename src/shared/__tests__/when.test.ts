import { describe, expect, it } from 'vitest'
import { describeWhen, parseDue, SCHEDULE_MAX_MS } from '../when'

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime()

describe('describeWhen', () => {
  const now = at(9, 20)
  it('uses the words people use', () => {
    expect(describeWhen(at(9, 23), now, 'en-US')).toBe('today at 11:00 PM')
    expect(describeWhen(at(10, 9), now, 'en-US')).toBe('tomorrow at 9:00 AM')
    expect(describeWhen(at(8, 9), now, 'en-US')).toBe('yesterday at 9:00 AM')
    expect(describeWhen(at(14, 17, 30), now, 'en-US')).toMatch(/^Sat, Nov 14 at 5:30 PM$/)
  })
})

describe('parseDue', () => {
  const now = at(9, 20)
  it('accepts a time ahead, in local time', () => {
    expect(parseDue('2026-11-10T09:00:00', now)).toBe(at(10, 9))
  })
  it('refuses the past, the next few seconds, the far future and nonsense', () => {
    expect(parseDue('2026-11-08T09:00:00', now)).toBeNull()
    expect(parseDue(new Date(now + 30_000).toISOString(), now)).toBeNull()
    expect(parseDue(new Date(now + SCHEDULE_MAX_MS + 1000).toISOString(), now)).toBeNull()
    expect(parseDue('whenever', now)).toBeNull()
    expect(parseDue(undefined, now)).toBeNull()
    expect(parseDue(1234, now)).toBeNull()
  })
})

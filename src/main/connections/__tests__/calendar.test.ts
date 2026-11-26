// D-54: date ranges, merging duplicates, and free time between 08:00 and 22:00.
import { describe, expect, it } from 'vitest'
import { dayRange, freeTime, mergeEvents } from '../calendar'
import type { CalendarEvent } from '../types'

const ev = (title: string, start: number, end: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  title, start, end, allDay: false, calendar: 'C', source: 'Apple Calendar', ...extra
})

describe('dayRange', () => {
  it('gives local midnights, the end day included', () => {
    const r = dayRange('2026-12-01', '2026-12-01', 14)
    expect(r).toEqual({ from: new Date(2026, 11, 1).getTime(), to: new Date(2026, 11, 2).getTime() })
  })
  it('explains bad input', () => {
    expect(dayRange('2026-13-01', '2026-12-01', 14)).toBe('Dates must look like 2026-12-01.')
    expect(dayRange('2026-12-05', '2026-12-01', 14)).toBe('The end date is before the start date.')
  })
  it('refuses more than the limit', () => {
    expect(dayRange('2026-12-01', '2026-12-15', 14)).toBe('Ask for at most 14 days at a time.')
    expect(dayRange('2026-12-01', '2026-12-14', 14)).toMatchObject({ from: expect.any(Number) })
  })
})

describe('mergeEvents', () => {
  it('drops the same event from two calendars, keeps the first', () => {
    const a = ev('Lab', 1000, 2000, { source: 'Apple Calendar' })
    const b = ev('Lab', 1000, 2000, { source: 'Google Calendar' })
    const merged = mergeEvents([[a], [b, ev('Gym', 500, 600)]])
    expect(merged.map((e) => e.title)).toEqual(['Gym', 'Lab'])
    expect(merged[1].source).toBe('Apple Calendar')
  })
})

describe('freeTime', () => {
  it('finds the gaps around a 10:00 to 11:00 event', () => {
    const day = new Date(2026, 11, 1).getTime()
    const event = ev('Talk', new Date(2026, 11, 1, 10).getTime(), new Date(2026, 11, 1, 11).getTime())
    const gaps = freeTime([event], day, day + 86_400_000)
    expect(gaps).toEqual([
      { start: new Date(2026, 11, 1, 8).getTime(), end: new Date(2026, 11, 1, 10).getTime() },
      { start: new Date(2026, 11, 1, 11).getTime(), end: new Date(2026, 11, 1, 22).getTime() }
    ])
  })
  it('skips all-day events and short gaps', () => {
    const day = new Date(2026, 11, 1).getTime()
    const allDay = ev('Holiday', day, day + 86_400_000, { allDay: true })
    const gaps = freeTime([allDay], day, day + 86_400_000)
    expect(gaps).toHaveLength(1)
  })
})

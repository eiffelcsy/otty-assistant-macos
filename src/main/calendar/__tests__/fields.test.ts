// D-73: what the Calendar screen and the model send is checked here, and times are worded the same way everywhere.
import { describe, expect, it } from 'vitest'
import { cleanFields, parseLocal, toItem, whenWords } from '../fields'

const DAY = 86_400_000
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const base = { title: 'Essay', start: local(2026, 12, 3, 14), end: local(2026, 12, 3, 16), allDay: false }

describe('cleanFields', () => {
  it('keeps a good timed event, trimming its title and dropping empty notes', () => {
    expect(cleanFields({ ...base, title: '  Essay  ', notes: '   ' })).toEqual({ title: 'Essay', start: base.start, end: base.end, allDay: false })
    expect(cleanFields({ ...base, notes: ' Read chapter 2 ', id: 'abc' })).toEqual({ id: 'abc', title: 'Essay', start: base.start, end: base.end, allDay: false, notes: 'Read chapter 2' })
  })

  it('refuses a missing, empty or long title', () => {
    expect(cleanFields({ ...base, title: '   ' })).toBeNull()
    expect(cleanFields({ ...base, title: 'x'.repeat(201) })).toBeNull()
    expect(cleanFields({ ...base, title: 3 })).toBeNull()
  })

  it('needs end after start, and at most 14 days apart', () => {
    expect(cleanFields({ ...base, end: base.start })).toBeNull()
    expect(cleanFields({ ...base, end: base.start - 1 })).toBeNull()
    expect(cleanFields({ ...base, start: 0, end: 15 * DAY })).toBeNull()
    expect(cleanFields({ ...base, start: 0, end: 14 * DAY })).not.toBeNull()
  })

  it('refuses numbers that are not finite, and wrong types', () => {
    expect(cleanFields({ ...base, start: NaN })).toBeNull()
    expect(cleanFields({ ...base, end: Infinity })).toBeNull()
    expect(cleanFields({ ...base, start: '2026-12-03' })).toBeNull()
    expect(cleanFields({ ...base, allDay: 'yes' })).toBeNull()
    expect(cleanFields(null)).toBeNull()
    expect(cleanFields([])).toBeNull()
  })

  it('limits notes to 2,000 characters and the id to 200', () => {
    expect(cleanFields({ ...base, notes: 'n'.repeat(2001) })).toBeNull()
    expect(cleanFields({ ...base, notes: 'n'.repeat(2000) })).not.toBeNull()
    expect(cleanFields({ ...base, id: 'i'.repeat(201) })).toBeNull()
    expect(cleanFields({ ...base, notes: 7 })).toBeNull()
  })

  it('snaps an all-day event to whole local days, the end at the midnight after its last day', () => {
    const got = cleanFields({ title: 'Trip', start: local(2026, 12, 5, 13, 20), end: local(2026, 12, 5, 18), allDay: true })
    expect(got).toEqual({ title: 'Trip', start: local(2026, 12, 5), end: local(2026, 12, 6), allDay: true })
  })

  it('keeps an all-day end already at a midnight, and moves one part way through a day to the next midnight', () => {
    expect(cleanFields({ title: 'Trip', start: local(2026, 12, 5), end: local(2026, 12, 7), allDay: true })?.end).toBe(local(2026, 12, 7))
    expect(cleanFields({ title: 'Trip', start: local(2026, 12, 5), end: local(2026, 12, 7, 9), allDay: true })?.end).toBe(local(2026, 12, 8))
  })

  it('refuses an all-day span that is more than 14 days once snapped', () => {
    expect(cleanFields({ title: 'Trip', start: local(2026, 12, 1, 10), end: local(2026, 12, 15, 9), allDay: true })).toBeNull()
  })
})

describe('parseLocal', () => {
  it('reads a local time, or a local midnight for a day', () => {
    expect(parseLocal('2026-12-04T14:00')).toBe(local(2026, 12, 4, 14))
    expect(parseLocal('2026-12-04')).toBe(local(2026, 12, 4))
  })

  it('refuses anything else, and dates that do not exist', () => {
    expect(parseLocal('4 Dec 2026')).toBeNull()
    expect(parseLocal('2026-12-04T25:00')).toBeNull()
    expect(parseLocal('2026-02-30')).toBeNull()
    expect(parseLocal('2026-12-04T14')).toBeNull()
  })
})

describe('whenWords', () => {
  it('words a timed event on one day', () => {
    expect(whenWords(local(2026, 12, 4, 14), local(2026, 12, 4, 16), false)).toMatch(/^\w{3} 4 Dec, 14:00–16:00$/)
  })

  it('words all-day events on one day, and over several', () => {
    expect(whenWords(local(2026, 12, 5), local(2026, 12, 6), true)).toMatch(/^\w{3} 5 Dec, all day$/)
    expect(whenWords(local(2026, 12, 5), local(2026, 12, 8), true)).toMatch(/^\w{3} 5 – \w{3} 7 Dec, all day$/)
  })

  it('words a timed event across days with both dates and times', () => {
    expect(whenWords(local(2026, 12, 4, 22), local(2026, 12, 5, 1), false)).toMatch(/^\w{3} 4 Dec 22:00 – \w{3} 5 Dec 01:00$/)
  })
})

describe('toItem', () => {
  it('shows an Otty event as its own, editable', () => {
    expect(toItem({ id: 'e1', title: 'Essay', start: 1, end: 2, allDay: false, madeBy: 'otty', created: 1, updated: 1 })).toEqual({
      id: 'e1',
      title: 'Essay',
      start: 1,
      end: 2,
      allDay: false,
      madeBy: 'otty',
      source: 'Otty',
      readOnly: false
    })
  })
})

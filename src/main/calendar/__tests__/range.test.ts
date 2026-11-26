// D-73: the Calendar screen's range: Otty's own events with the connected reads beside them, cached for 2 minutes.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from '../../connections/types'
import { MemoryEventStore } from '../store'

const readCalendars = vi.fn()
vi.mock('../../connections/tools', () => ({ readCalendars: (...args: unknown[]) => readCalendars(...args) }))
vi.mock('../../sent', () => ({ record: vi.fn() }))

const { calendarRange, clearCalendarCache } = await import('../range')

const H = 3_600_000
const FROM = new Date(2026, 11, 4).getTime()
const TO = FROM + 86_400_000
const apple: CalendarEvent = { title: 'Lunch', start: FROM + 12 * H, end: FROM + 13 * H, allDay: false, calendar: 'Home', source: 'Apple Calendar' }

function store() {
  const s = new MemoryEventStore()
  s.save({ id: 'e1', title: 'Essay', start: FROM + 9 * H, end: FROM + 11 * H, allDay: false, madeBy: 'otty', created: 1, updated: 1 })
  return s
}

beforeEach(() => {
  readCalendars.mockReset()
  readCalendars.mockResolvedValue({ events: [apple], failures: [], sources: 1 })
  clearCalendarCache()
  vi.useRealTimers()
})

describe('calendarRange', () => {
  it('merges Otty’s own events with the connected ones, soonest first, and marks only Otty’s as editable', async () => {
    const got = await calendarRange(store(), FROM, TO)
    expect(got.items.map((i) => [i.title, i.readOnly, i.source])).toEqual([
      ['Essay', false, 'Otty'],
      ['Lunch', true, 'Apple Calendar']
    ])
    expect(got.items[1]).toMatchObject({ id: `Apple Calendar:${FROM + 12 * H}:Lunch`, calendar: 'Home' })
    expect(got.note).toBeUndefined()
  })

  it('asks the connections for the range without Otty’s own events, so they aren’t listed twice', async () => {
    await calendarRange(store(), FROM, TO)
    expect(readCalendars).toHaveBeenCalledWith(FROM, TO, expect.any(Function), { otty: false })
  })

  it('reads the connections once per range for 2 minutes, but Otty’s own events every time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FROM)
    const s = store()
    await calendarRange(s, FROM, TO)
    s.save({ id: 'e2', title: 'Gym', start: FROM + 18 * H, end: FROM + 19 * H, allDay: false, madeBy: 'you', created: 1, updated: 1 })
    const again = await calendarRange(s, FROM, TO)
    expect(readCalendars).toHaveBeenCalledTimes(1)
    expect(again.items.map((i) => i.title)).toEqual(['Essay', 'Lunch', 'Gym'])

    vi.setSystemTime(FROM + 2 * 60_000 + 1)
    await calendarRange(s, FROM, TO)
    expect(readCalendars).toHaveBeenCalledTimes(2)
  })

  it('gives a one-line note for a connection that failed, and the rest still shows', async () => {
    readCalendars.mockResolvedValue({ events: [], failures: ['Apple Calendar’s sign-in ran out.'], sources: 1 })
    const got = await calendarRange(store(), FROM, TO)
    expect(got.note).toBe('Apple Calendar’s sign-in ran out.')
    expect(got.items.map((i) => i.title)).toEqual(['Essay'])
  })

  it('says a connected calendar couldn’t be read when the read itself throws, and keeps Otty’s own', async () => {
    readCalendars.mockRejectedValue(new Error('boom'))
    const got = await calendarRange(store(), FROM, TO)
    expect(got.note).toBe('A connected calendar couldn’t be read.')
    expect(got.items.map((i) => i.title)).toEqual(['Essay'])
  })
})

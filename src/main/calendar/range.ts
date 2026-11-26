import type { CalendarItem, CalendarRange } from '../../shared/types'
import { readCalendars } from '../connections/tools'
import { record } from '../sent'
import type { EventStore } from './store'
import { toItem } from './fields'

// D-73: the Calendar screen's events and Home's Today: Otty's own, with the connected calendars read beside them
// (read-only). A connected read is cached for 2 minutes per range, so paging back and forth doesn't ask Apple or Google
// every time.

const TTL = 120_000

interface Connected {
  items: CalendarItem[]
  note?: string
  expires: number
}

const cache = new Map<string, Connected>()

/** Forgets the cached reads, when a connection is added or removed. */
export function clearCalendarCache(): void {
  cache.clear()
}

async function connectedFor(from: number, to: number): Promise<Connected> {
  const key = `${from}:${to}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit
  try {
    const r = await readCalendars(from, to, (service, host, local, what) => record({ kind: 'connection', service, host, local, what: `${what} for the calendar` }), { otty: false })
    const items = r.events.map((e): CalendarItem => ({
      id: `${e.source}:${e.start}:${e.title}`,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      source: e.source,
      calendar: e.calendar,
      readOnly: true
    }))
    const got: Connected = { items, ...(r.failures.length ? { note: r.failures.join(' ') } : {}), expires: Date.now() + TTL }
    cache.set(key, got)
    return got
  } catch (err) {
    console.error('Could not read the connected calendars', err)
    return { items: [], note: 'A connected calendar couldn’t be read.', expires: 0 }
  }
}

/** Otty's events in [from, to) plus the connected ones, soonest first. */
export async function calendarRange(store: EventStore, from: number, to: number): Promise<CalendarRange> {
  const connected = await connectedFor(from, to)
  const items = [...store.range(from, to).map(toItem), ...connected.items].sort((a, b) => a.start - b.start || a.title.localeCompare(b.title))
  return { items, ...(connected.note ? { note: connected.note } : {}) }
}

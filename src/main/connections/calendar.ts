// D-54: the calendar helpers every source shares: dates from the model, merging, and free time.
import { LIMITS, type CalendarEvent } from './types'

const DAY = 86_400_000

/** A `YYYY-MM-DD` as local midnight, or null when it isn't a real date. */
function dayOf(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

/** From the start of `from` to the end of `to` (both inclusive, local days), or the words to say why not. */
export function dayRange(from: string, to: string, maxDays: number): { from: number; to: number } | string {
  const a = dayOf(from)
  const b = dayOf(to)
  if (!a || !b) return 'Dates must look like 2026-12-01.'
  if (b < a) return 'The end date is before the start date.'
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1)
  const days = Math.round((end.getTime() - a.getTime()) / DAY)
  if (days > maxDays) return `Ask for at most ${maxDays} days at a time.`
  return { from: a.getTime(), to: end.getTime() }
}

/** All sources' events in one list. The same event from two calendars (Google added to macOS) appears once. */
/** `max` is for what the model reads; free time needs every event, so it passes Infinity. */
export function mergeEvents(lists: CalendarEvent[][], max: number = LIMITS.events): CalendarEvent[] {
  const seen = new Set<string>()
  const out: CalendarEvent[] = []
  for (const e of lists.flat()) {
    const key = `${e.title}\u0000${e.start}\u0000${e.end}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title))
    .slice(0, max)
}

/** Gaps of 30 minutes or more between 08:00 and 22:00 on each local day in [from, to), around the timed events. */
export function freeTime(events: CalendarEvent[], from: number, to: number): { start: number; end: number }[] {
  const busy = events.filter((e) => !e.allDay).sort((a, b) => a.start - b.start)
  const gaps: { start: number; end: number }[] = []
  const day = new Date(from)
  day.setHours(0, 0, 0, 0)
  while (day.getTime() < to) {
    const y = day.getFullYear()
    const m = day.getMonth()
    const d = day.getDate()
    const windowStart = new Date(y, m, d, 8).getTime()
    const windowEnd = new Date(y, m, d, 22).getTime()
    let cursor = windowStart
    const addGap = (end: number): void => {
      if (end - cursor >= 30 * 60_000) gaps.push({ start: cursor, end })
    }
    for (const e of busy) {
      if (e.end <= cursor || e.start >= windowEnd) continue
      if (e.start > cursor) addGap(Math.min(e.start, windowEnd))
      cursor = Math.max(cursor, e.end)
    }
    if (cursor < windowEnd) addGap(windowEnd)
    day.setTime(new Date(y, m, d + 1).getTime())
  }
  return gaps
}

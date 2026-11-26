import type { CalendarItem, EventFields } from '../../shared/types'
import type { StoredEvent } from './store'

// D-73: checks what the Calendar screen and the model send, and words for times. Pure, so it's tested without a Mac.

const DAY = 86_400_000
const MAX_SPAN = 14 * DAY

const startOfDay = (ms: number): number => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
/** The local midnight after `ms`'s day, whatever the clock does around it. */
const nextMidnight = (ms: number): number => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
}

/**
 * Checks what a window or the model sent. An all-day event snaps to whole days: it starts at local midnight and ends
 * at the local midnight after its last day (an end already at midnight is kept as it is). Null when anything is wrong.
 */
export function cleanFields(x: unknown): EventFields | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const r = x as Record<string, unknown>
  if (typeof r.title !== 'string') return null
  const title = r.title.trim()
  if (!title || title.length > 200) return null
  if (typeof r.start !== 'number' || typeof r.end !== 'number' || !Number.isFinite(r.start) || !Number.isFinite(r.end)) return null
  if (typeof r.allDay !== 'boolean') return null
  if (r.notes !== undefined && r.notes !== null && typeof r.notes !== 'string') return null
  const notes = typeof r.notes === 'string' ? r.notes.trim() : ''
  if (notes.length > 2000) return null
  if (r.id !== undefined && (typeof r.id !== 'string' || !r.id || r.id.length > 200)) return null
  if (r.end <= r.start) return null

  let start = r.start
  let end = r.end
  if (r.allDay) {
    start = startOfDay(start)
    end = end === startOfDay(end) ? end : nextMidnight(end)
  }
  if (end <= start || end - start > MAX_SPAN) return null
  return {
    ...(typeof r.id === 'string' ? { id: r.id } : {}),
    title,
    start,
    end,
    allDay: r.allDay,
    ...(notes ? { notes } : {})
  }
}

/** `YYYY-MM-DDTHH:MM` as local time, or `YYYY-MM-DD` as local midnight. Null for anything else or an invalid date. */
export function parseLocal(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const h = m[4] === undefined ? 0 : Number(m[4])
  const mi = m[5] === undefined ? 0 : Number(m[5])
  if (h > 23 || mi > 59) return null
  const at = new Date(y, mo - 1, d, h, mi)
  if (at.getFullYear() !== y || at.getMonth() !== mo - 1 || at.getDate() !== d) return null
  return at.getTime()
}

const hm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const dayWords = (ms: number, month = true) =>
  new Date(ms).toLocaleDateString('en-GB', month ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' })

/** The time in words, en-GB: "Thu 4 Dec, 14:00–16:00", "Fri 5 Dec, all day", "Fri 5 – Sun 7 Dec, all day". */
export function whenWords(start: number, end: number, allDay: boolean): string {
  if (allDay) {
    const last = startOfDay(end - 1)
    if (last === startOfDay(start)) return `${dayWords(start)}, all day`
    const sameMonth = new Date(last).getMonth() === new Date(start).getMonth()
    return `${dayWords(start, !sameMonth)} – ${dayWords(last)}, all day`
  }
  if (startOfDay(start) === startOfDay(end)) return `${dayWords(start)}, ${hm(start)}–${hm(end)}`
  return `${dayWords(start)} ${hm(start)} – ${dayWords(end)} ${hm(end)}`
}

export function toItem(e: StoredEvent): CalendarItem {
  return {
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    ...(e.notes !== undefined ? { notes: e.notes } : {}),
    madeBy: e.madeBy,
    source: 'Otty',
    readOnly: false
  }
}

// Local-time helpers for the Calendar (D-73, Spec 11). Every word is English, so the copy reads the same on any Mac.
// Days are local midnights; `addDays` and `atMinute` go through the Date constructor so a DST change keeps the wall clock.

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number) => String(n).padStart(2, '0')

/** Local midnight of the day `ms` falls on. */
export function dayStart(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Local midnight, `n` days after the day `ms` falls on (negative goes back). */
export function addDays(ms: number, n: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime()
}

/** The Monday of the week `ms` falls in, at local midnight. */
export function mondayOf(ms: number): number {
  const dow = (new Date(ms).getDay() + 6) % 7
  return addDays(dayStart(ms), -dow)
}

/** Local midnight of `day` plus `min` minutes (it may run past 24 h, which the Date constructor carries). */
export function atMinute(day: number, min: number): number {
  const d = new Date(day)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, min).getTime()
}

/** Minutes since local midnight, for a time on its own day. */
export function minutesOf(ms: number): number {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}

export const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "Thursday 4 December". */
export function longDay(ms: number): string {
  const d = new Date(ms)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "Thu 4 Dec". */
export function shortDay(ms: number): string {
  const d = new Date(ms)
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

/** "Thu 4 Dec, 14:00–16:00" or "Fri 5 Dec, all day" (Spec 11, Part 6). */
export const whenWords = (start: number, end: number, allDay: boolean): string => `${shortDay(start)}, ${allDay ? 'all day' : `${clock(start)}–${clock(end)}`}`

/** The day's group label on the list: "Today", "Tomorrow", or "Wednesday 3 December". */
export function dayLabel(day: number, today: number): string {
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  return longDay(day)
}

/** The header's range: "1 – 7 December", "29 Nov – 5 Dec", "29 Dec 2026 – 4 Jan 2027". `start` is the first day. */
export function rangeTitle(start: number): string {
  const first = new Date(start)
  const last = new Date(addDays(start, 6))
  if (first.getMonth() === last.getMonth()) return `${first.getDate()} – ${last.getDate()} ${MONTHS[last.getMonth()]}`
  if (first.getFullYear() === last.getFullYear()) return `${first.getDate()} ${SHORT_MONTHS[first.getMonth()]} – ${last.getDate()} ${SHORT_MONTHS[last.getMonth()]}`
  return `${first.getDate()} ${SHORT_MONTHS[first.getMonth()]} ${first.getFullYear()} – ${last.getDate()} ${SHORT_MONTHS[last.getMonth()]} ${last.getFullYear()}`
}

/** The label a block or row says to assistive tech: "Title, Thursday 4 December, 14:00 to 16:00". */
export function eventLabel(title: string, start: number, end: number, allDay: boolean): string {
  return allDay ? `${title}, ${longDay(start)}, all day` : `${title}, ${longDay(start)}, ${clock(start)} to ${clock(end)}`
}

/** The time column of a row: "All day" or "14:00–16:00". */
export const timeRange = (start: number, end: number, allDay: boolean): string => (allDay ? 'All day' : `${clock(start)}–${clock(end)}`)

/** "YYYY-MM-DD" for a date input. */
export const ymd = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "HH:MM" for a time input. */
export const hm = (ms: number): string => clock(ms)

/** The local midnight of a "YYYY-MM-DD" string, or NaN when it isn't a real date. */
export function parseDay(v: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return NaN
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return d.getDate() === +m[3] ? d.getTime() : NaN
}

/** Minutes since midnight for an "HH:MM" string, or NaN. */
export function parseClock(v: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(v)
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN
}

/** Local midnight of the 1st of the month `ms` falls in, `n` months on (negative goes back). */
export function monthOf(ms: number, n = 0): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime()
}

/** "November 2026". */
export function monthTitle(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

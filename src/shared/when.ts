// "Tomorrow at 9:00 AM": a time in the words people use, for cards and Activity rows.

const DAY = 86_400_000
const midnight = (t: number) => new Date(t).setHours(0, 0, 0, 0)

export function describeWhen(at: number, now = Date.now(), locale?: string): string {
  const time = new Date(at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  const days = Math.round((midnight(at) - midnight(now)) / DAY)
  if (days === 0) return `today at ${time}`
  if (days === 1) return `tomorrow at ${time}`
  if (days === -1) return `yesterday at ${time}`
  const day = new Date(at).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day} at ${time}`
}

/** The most that can be scheduled ahead, and the least. Past a month, a "later" has probably been forgotten. */
export const SCHEDULE_MAX_MS = 30 * DAY
export const SCHEDULE_MIN_MS = 60_000

/** A time the model gave, as ms since epoch, or null if it isn't a time, has passed, or is too far off. */
export function parseDue(text: unknown, now = Date.now()): number | null {
  if (typeof text !== 'string') return null
  const at = new Date(text.trim()).getTime()
  if (!Number.isFinite(at)) return null
  return at - now >= SCHEDULE_MIN_MS && at - now <= SCHEDULE_MAX_MS ? at : null
}

// Repeating looks (D-34): "every Monday at 9". Pure, so the runner, the card and the tests agree. The time of day
// comes from the first run, so a repeat is only ever which days. Daily is the most often a look can come round, and
// weekly the least, so a series can't run away or go so quiet it's forgotten.

export type Repeat = { every: 'day' } | { every: 'weekday' } | { every: 'week'; day: number }

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** What the model asked for, as one of the three, or null. Weekly falls on the first run's day. */
export function parseRepeat(raw: unknown, firstAt: number): Repeat | null {
  if (raw === 'daily') return { every: 'day' }
  if (raw === 'weekdays') return { every: 'weekday' }
  if (raw === 'weekly') return { every: 'week', day: new Date(firstAt).getDay() }
  return null
}

/** A saved repeat, read back. Anything else is no repeat, so a damaged row can only stop a series, never widen it. */
export function readRepeat(json: string | null | undefined): Repeat | null {
  if (!json) return null
  try {
    const r = JSON.parse(json) as Repeat
    if (r.every === 'day' || r.every === 'weekday') return { every: r.every }
    if (r.every === 'week' && Number.isInteger(r.day) && r.day >= 0 && r.day <= 6) return { every: 'week', day: r.day }
  } catch {
    /* no repeat */
  }
  return null
}

const fits = (r: Repeat, d: Date) => (r.every === 'day' ? true : r.every === 'weekday' ? d.getDay() >= 1 && d.getDay() <= 5 : d.getDay() === r.day)

/** The first run on or after `at`, at the same time of day: a weekday series asked for on a Saturday starts Monday. */
export function firstRun(r: Repeat, at: number): number {
  const d = new Date(at)
  for (let i = 0; i < 7 && !fits(r, d); i++) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/**
 * The next run after `after`, at the series' time of day. Stepping by calendar day keeps 9:00 at 9:00 across
 * daylight saving, and starting from `after` means runs missed while the Mac slept are skipped, not queued up.
 */
export function nextRun(r: Repeat, timeOf: number, after: number): number {
  const t = new Date(timeOf)
  const d = new Date(after)
  d.setHours(t.getHours(), t.getMinutes(), 0, 0)
  for (let i = 0; i < 8; i++) {
    if (d.getTime() > after && fits(r, d)) return d.getTime()
    d.setDate(d.getDate() + 1)
    d.setHours(t.getHours(), t.getMinutes(), 0, 0)
  }
  return d.getTime()
}

/** "every Monday at 9:00 AM". */
export function repeatWords(r: Repeat, timeOf: number, locale?: string): string {
  const time = new Date(timeOf).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  if (r.every === 'day') return `every day at ${time}`
  if (r.every === 'weekday') return `every weekday at ${time}`
  return `every ${DAY_NAMES[r.day]} at ${time}`
}

/** Roughly how many runs a month, for the card. */
export const runsPerMonth = (r: Repeat): number => (r.every === 'day' ? 30 : r.every === 'weekday' ? 22 : 4)

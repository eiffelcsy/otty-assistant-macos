// D-54: Apple Calendar and Reminders, read through the small Swift helper (macOS asks once for access).
import { execFile } from 'child_process'
import { maskSecrets } from '../../shared/secrets'
import { ConnectionError, LIMITS, type CalendarEvent, type Reminder } from './types'

let helper: () => string = () => ''

/** Plugged in by `core.ts`: where the calendar helper is built. */
export function setCalendarHelper(path: () => string): void {
  helper = path
}

const DENIED = 'Otty isn’t allowed to read your calendars. Turn it on in System Settings › Privacy & Security › Calendars.'

/** Runs the helper and parses its JSON. Callback-style rather than `promisify`, so a fake `execFile` works the same. */
async function run(args: string[]): Promise<any> {
  if (process.platform !== 'darwin') throw new ConnectionError('Apple Calendar only works on a Mac.', 'bad')
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(helper(), args, { timeout: LIMITS.connectMs, maxBuffer: 4_000_000 }, (err, out) => {
      if (err) reject(err)
      else resolve(String(out))
    })
  }).catch((err: { code?: unknown }) => {
    if (err.code === 2) throw new ConnectionError(DENIED, 'denied')
    throw new ConnectionError('Otty couldn’t read your calendars just now. Try again.', 'bad')
  })
  let data: any
  try {
    data = JSON.parse(stdout)
  } catch {
    throw new ConnectionError('Otty couldn’t read your calendars just now. Try again.', 'bad')
  }
  if (data?.error === 'denied') throw new ConnectionError(DENIED, 'denied')
  return data
}

const clean = (value: unknown, max: number): string =>
  maskSecrets(typeof value === 'string' ? value : '').text.slice(0, max).trim()

/** Whether Otty may read the calendars. */
export async function appleAccess(): Promise<boolean> {
  const data = await run(['access'])
  return data?.calendar === 'granted'
}

/** Events between `from` and `to` (epoch ms). */
export async function appleEvents(from: number, to: number): Promise<CalendarEvent[]> {
  const data = await run(['events', new Date(from).toISOString(), new Date(to).toISOString()])
  const out: CalendarEvent[] = []
  for (const e of Array.isArray(data?.events) ? data.events : []) {
    const title = clean(e?.title, 200)
    const start = Date.parse(e?.start)
    const end = Date.parse(e?.end)
    if (!title || Number.isNaN(start) || Number.isNaN(end)) continue
    out.push({
      title,
      start,
      end,
      allDay: Boolean(e.allDay),
      ...(e.location ? { location: clean(e.location, 200) } : {}),
      calendar: clean(e.calendar, 100),
      source: 'Apple Calendar'
    })
  }
  return out
}

/** Reminders, soonest due first (undated last), up to `LIMITS.reminders`. */
export async function appleReminders(): Promise<Reminder[]> {
  const data = await run(['reminders'])
  const out: Reminder[] = []
  for (const r of Array.isArray(data?.reminders) ? data.reminders : []) {
    const title = clean(r?.title, 200)
    if (!title) continue
    const due = r.due ? Date.parse(r.due) : NaN
    out.push({ title, ...(Number.isNaN(due) ? {} : { due }), list: clean(r.list, 100) })
  }
  return out
    .sort((a, b) => (a.due ?? Number.MAX_SAFE_INTEGER) - (b.due ?? Number.MAX_SAFE_INTEGER))
    .slice(0, LIMITS.reminders)
}

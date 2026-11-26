// D-54: Apple helper results, and the denied and failed paths.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { execFile } from 'child_process'
import { appleEvents, appleReminders, setCalendarHelper } from '../apple'
import { ConnectionError } from '../types'

vi.mock('child_process', () => ({ execFile: vi.fn() }))
const execMock = vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!

/** Makes the next helper call answer with `stdout`, or fail with `code`. */
function answer(stdout: string, code?: number): void {
  execMock.mockImplementationOnce((_file: string, _args: string[], _opts: unknown, cb: (err: unknown, out?: string) => void) => {
    if (code !== undefined) cb(Object.assign(new Error('exit'), { code }), '')
    else cb(null, stdout)
  })
}

beforeEach(() => {
  execMock.mockReset()
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  setCalendarHelper(() => '/helper')
})
afterEach(() => Object.defineProperty(process, 'platform', platform))

describe('apple', () => {
  it('a denied helper is a denied error', async () => {
    answer(JSON.stringify({ error: 'denied' }))
    await expect(appleEvents(0, 1)).rejects.toMatchObject({ kind: 'denied' })
  })

  it('exit code 2 is denied too', async () => {
    answer('', 2)
    await expect(appleReminders()).rejects.toMatchObject({ kind: 'denied' })
  })

  it('maps events and skips ones without a title or time', async () => {
    answer(
      JSON.stringify({
        events: [
          { title: 'Lab', start: '2026-12-01T10:00:00Z', end: '2026-12-01T11:00:00Z', allDay: false, calendar: 'Home' },
          { title: '', start: '2026-12-01T10:00:00Z', end: '2026-12-01T11:00:00Z', calendar: 'Home' }
        ]
      })
    )
    const events = await appleEvents(0, 1)
    expect(events).toEqual([{ title: 'Lab', start: Date.parse('2026-12-01T10:00:00Z'), end: Date.parse('2026-12-01T11:00:00Z'), allDay: false, calendar: 'Home', source: 'Apple Calendar' }])
  })

  it('reminders sort soonest first, undated last', async () => {
    answer(JSON.stringify({ reminders: [{ title: 'b', list: 'L' }, { title: 'a', due: '2026-12-01T09:00:00Z', list: 'L' }] }))
    const list = await appleReminders()
    expect(list.map((r) => r.title)).toEqual(['a', 'b'])
  })

  it('refuses off macOS without calling the helper', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    await expect(appleEvents(0, 1)).rejects.toBeInstanceOf(ConnectionError)
    expect(execMock).not.toHaveBeenCalled()
  })
})

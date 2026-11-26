import { appendFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedbackText } from '../diagnostics'

const { warn, error } = console

beforeEach(() => {
  vi.resetModules()
  console.warn = vi.fn()
  console.error = vi.fn()
})

afterEach(() => {
  console.warn = warn
  console.error = error
})

describe('Send feedback text (D-79)', () => {
  it('holds only the note unless the log is ticked', () => {
    expect(feedbackText('It froze.', false, 'report', ['2026-11-26T10:00:00.000Z warn x'])).toBe('It froze.')
  })

  it('adds the diagnostics and the day’s log under their headings when ticked', () => {
    const text = feedbackText('It froze.', true, 'Otty 0.5.0', ['line one', 'line two'])
    expect(text).toBe('It froze.\n\n— Diagnostics —\nOtty 0.5.0\n\n— Log, last 24 hours —\nline one\nline two')
  })
})

describe('the last day of the log (D-79)', () => {
  it('keeps the lines from the last 24 hours, at most the last 300', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'otty-help-'))
    const { startLog, lastDay } = await import('../log')
    startLog(dir, '0.5.0')
    const file = join(dir, 'otty.log')
    const now = Date.parse('2026-11-26T12:00:00.000Z')
    const stamp = (ms: number) => new Date(ms).toISOString()
    const old = `${stamp(now - 25 * 3_600_000)} error too old\n`
    const recent = Array.from({ length: 310 }, (_, i) => `${stamp(now - 60_000 + i)} info recent ${i}\n`).join('')
    appendFileSync(file, old + recent)
    const day = lastDay(now)
    expect(day).toHaveLength(300)
    expect(day.some((l) => l.includes('too old'))).toBe(false)
    expect(day.at(-1)).toContain('recent 309')
    expect(day[0]).toContain('recent 10')
  })
})

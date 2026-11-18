import { describe, expect, it } from 'vitest'
import { capPassed, capReached, capStatus, cleanCap, isCapNote, monthStart } from '../cap'
import { healthProblem } from '../health'
import { firstRun, nextRun, parseRepeat, readRepeat, repeatWords, runsPerMonth } from '../repeat'
import { hint, HIDDEN, maskSecrets } from '../secrets'

const settings = { takenHotkeys: [], askHotkey: 'Alt+Space', snapHotkey: 'Alt+Shift+Space', screenHotkey: 'Command+Alt+Shift+Space' }

describe('the monthly limit (D-33)', () => {
  it('only keeps a real cap from the renderer', () => {
    expect(cleanCap({ unit: 'questions', limit: 300 })).toEqual({ unit: 'questions', limit: 300 })
    expect(cleanCap({ unit: 'tokens', limit: '2500000.7' })).toEqual({ unit: 'tokens', limit: 2_500_000 })
    expect(cleanCap({ unit: 'dollars', limit: 5 })).toBeNull()
    expect(cleanCap({ unit: 'questions', limit: 0 })).toBeNull()
    expect(cleanCap({ unit: 'questions', limit: 'lots' })).toBeNull()
    expect(cleanCap(null)).toBeNull()
    expect(cleanCap({ unit: 'questions', limit: 1e12 })?.limit).toBe(100_000)
  })

  it('is over once this month reaches it', () => {
    const cap = { unit: 'questions' as const, limit: 10 }
    expect(capStatus(cap, { questions: 9, tokens: 0 })).toMatchObject({ used: 9, over: false })
    expect(capStatus(cap, { questions: 10, tokens: 0 })).toMatchObject({ used: 10, over: true })
    expect(capStatus(null, { questions: 99, tokens: 0 })).toBeNull()
  })

  it('says so in friendly words, never money', () => {
    const cap = { unit: 'questions' as const, limit: 10 }
    expect(capReached(cap)).toBe('You’ve reached this month’s limit of 10 questions. Run it anyway?')
    expect(isCapNote(capReached(cap))).toBe(true)
    expect(isCapNote('This has been sitting a while. Keep going?')).toBe(false)
    expect(capPassed(cap)).toMatch(/Your own questions still go through/)
    expect(capPassed(cap)).not.toMatch(/\$|cost|price/i)
  })

  it('says a limit of one in the singular', () => {
    expect(capReached({ unit: 'questions', limit: 1 })).toBe('You’ve reached this month’s limit of 1 question. Run it anyway?')
    expect(isCapNote(capReached({ unit: 'questions', limit: 1 }))).toBe(true)
    expect(capPassed({ unit: 'tokens', limit: 1 })).toMatch(/limit of 1 token\./)
  })

  it('counts from the first of the month', () => {
    expect(monthStart(new Date(2026, 10, 15, 13, 0))).toEqual(new Date(2026, 10, 1))
  })

  it('shows in the banner last, after anything that stops a shortcut working', () => {
    const over = { unit: 'questions' as const, limit: 10, used: 11, over: true }
    expect(healthProblem(null, settings, over)).toEqual({ kind: 'cap', cap: { unit: 'questions', limit: 10 } })
    expect(healthProblem({ platform: 'darwin', accessibility: false, screen: true }, settings, over)?.kind).toBe('accessibility')
    expect(healthProblem(null, settings, { ...over, used: 5, over: false })).toBeNull()
  })
})

describe('repeats (D-34)', () => {
  const tuesdayNine = new Date(2026, 10, 10, 9, 0).getTime()

  it('takes only daily, weekdays or weekly, weekly on the first run’s day', () => {
    expect(parseRepeat('daily', tuesdayNine)).toEqual({ every: 'day' })
    expect(parseRepeat('weekdays', tuesdayNine)).toEqual({ every: 'weekday' })
    expect(parseRepeat('weekly', tuesdayNine)).toEqual({ every: 'week', day: 2 })
    for (const bad of ['hourly', 'every minute', 5, null]) expect(parseRepeat(bad, tuesdayNine)).toBeNull()
  })

  it('reads back only what it wrote', () => {
    expect(readRepeat('{"every":"week","day":1}')).toEqual({ every: 'week', day: 1 })
    expect(readRepeat('{"every":"week","day":9}')).toBeNull()
    expect(readRepeat('{"every":"minute"}')).toBeNull()
    expect(readRepeat('not json')).toBeNull()
    expect(readRepeat(null)).toBeNull()
  })

  it('finds the next run at the same time, after now, skipping what was missed', () => {
    const weekly = { every: 'week' as const, day: 2 }
    expect(nextRun(weekly, tuesdayNine, tuesdayNine)).toBe(new Date(2026, 10, 17, 9, 0).getTime())
    // Woke on a Thursday, two weeks on: next Tuesday, not the missed ones.
    expect(nextRun(weekly, tuesdayNine, new Date(2026, 10, 26, 12, 0).getTime())).toBe(new Date(2026, 11, 1, 9, 0).getTime())
    expect(nextRun({ every: 'day' }, tuesdayNine, new Date(2026, 10, 10, 8, 0).getTime())).toBe(tuesdayNine)
    // Friday 9am, weekdays: Monday.
    expect(nextRun({ every: 'weekday' }, tuesdayNine, new Date(2026, 10, 13, 9, 0).getTime())).toBe(new Date(2026, 10, 16, 9, 0).getTime())
  })

  it('keeps 9am at 9am across a change of the clocks', () => {
    // Whatever the time zone, stepping by calendar day keeps the hour.
    const march = new Date(2027, 2, 1, 9, 0).getTime()
    for (let i = 0, at = march; i < 40; i++) {
      at = nextRun({ every: 'day' }, march, at)
      expect(new Date(at).getHours()).toBe(9)
    }
  })

  it('moves a first run to a day that fits', () => {
    expect(firstRun({ every: 'weekday' }, new Date(2026, 10, 15, 9, 0).getTime())).toBe(new Date(2026, 10, 16, 9, 0).getTime())
    expect(firstRun({ every: 'day' }, tuesdayNine)).toBe(tuesdayNine)
  })

  it('says it in words, with how many a month', () => {
    expect(repeatWords({ every: 'week', day: 1 }, tuesdayNine, 'en-US')).toBe('every Monday at 9:00 AM')
    expect(repeatWords({ every: 'weekday' }, tuesdayNine, 'en-US')).toBe('every weekday at 9:00 AM')
    expect(runsPerMonth({ every: 'day' })).toBe(30)
    expect(runsPerMonth({ every: 'week', day: 1 })).toBe(4)
  })
})

describe('hiding keys in typed words (D-32)', () => {
  it('takes out key shapes but leaves NAME=value as the user wrote it', () => {
    const typed = 'my key is sk-proj-abcdefghijklmnopqrstuv and DB_PASSWORD=hunter22 is the other one'
    const out = maskSecrets(typed, { shapesOnly: true })
    expect(out.text).toBe(`my key is ${HIDDEN} and DB_PASSWORD=hunter22 is the other one`)
    expect(out.hidden).toBe(1)
    expect(maskSecrets(typed).hidden).toBe(2)
  })
})

describe('what was hidden, shown as a hint (D-40)', () => {
  it('names each hidden thing’s line with only a hint of its value', () => {
    const text = 'start\nOPENAI_KEY=sk-abcdefghijklmnop1234 in prod\nDB_PASSWORD="hunter22pass"\nend'
    const { lines, hidden } = maskSecrets(text, { lines: true })
    expect(hidden).toBe(2)
    expect(lines).toEqual(['OPENAI_KEY=sk-…1234 in prod', 'DB_PASSWORD="…"'])
    expect(lines!.join()).not.toMatch(/abcdefghijklmnop|hunter22/)
  })

  it('cuts a value to its first three and last four, and a private key to words', () => {
    expect(hint('sk-abcdefghijklmnop1234')).toBe('sk-…1234')
    expect(hint('short')).toBe('…')
    expect(hint('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----')).toBe('[a private key]')
  })

  it('adds nothing unless asked', () => {
    expect(maskSecrets('token = "abcdef123456"')).not.toHaveProperty('lines')
  })
})

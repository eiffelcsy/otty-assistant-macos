import { describe, expect, it } from 'vitest'
import { capNear, monthKey, nearCap } from '../cap'
import { healthProblem } from '../health'
import type { CapStatus } from '../types'

// D-57: a heads-up at 80% of the monthly limit, once a month, and never once the limit has passed.

const at = (used: number): CapStatus => ({ unit: 'questions', limit: 100, used, over: used >= 100 })
const NOV = new Date(2026, 10, 18)
const DEC = new Date(2026, 11, 1)
const keys = { takenHotkeys: [], askHotkey: 'Alt+Space', snapHotkey: 'Alt+Shift+Space', screenHotkey: 'Command+Alt+Shift+Space' }

describe('the 80% heads-up', () => {
  it('starts at 80%, not 79%, and stops once the limit has passed', () => {
    expect(nearCap(at(79), null, NOV)).toBe(false)
    expect(nearCap(at(80), null, NOV)).toBe(true)
    expect(nearCap(at(99), null, NOV)).toBe(true)
    expect(nearCap(at(100), null, NOV)).toBe(false)
    expect(nearCap(null, null, NOV)).toBe(false)
  })

  it('shows once a month: seen in November, it’s gone for November and back in December', () => {
    expect(monthKey(NOV)).toBe('2026-11')
    expect(nearCap(at(85), '2026-11', NOV)).toBe(false)
    expect(nearCap(at(85), '2026-11', DEC)).toBe(true)
  })

  it('says how much, in words, on the health line, after anything that stops a shortcut working', () => {
    expect(capNear(at(85))).toBe('You’ve used 85% of this month’s limit of 100 questions. Past it, Otty asks before starting anything by itself.')
    expect(healthProblem(null, keys, at(80), NOV)).toEqual({ kind: 'near', cap: at(80) })
    expect(healthProblem(null, { ...keys, capNoticed: '2026-11' }, at(80), NOV)).toBeNull()
    expect(healthProblem(null, keys, at(100), NOV)?.kind).toBe('cap')
    expect(healthProblem(null, { ...keys, takenHotkeys: ['Alt+Space'] }, at(80), NOV)?.kind).toBe('hotkey')
  })
})

import { describe, expect, it } from 'vitest'
import { flipWidget, validWidgets } from '../homeWidgets'

describe('Home widgets (D-86)', () => {
  it('keeps only known widgets, once each', () => {
    expect(validWidgets(['calendar', 'tiles'])).toBe(true)
    expect(validWidgets([])).toBe(true)
    expect(validWidgets(['calendar', 'calendar'])).toBe(false)
    expect(validWidgets(['needs'])).toBe(false)
    expect(validWidgets('calendar')).toBe(false)
  })

  it('turns one on or off and keeps Home’s order', () => {
    expect(flipWidget(['tiles', 'calendar'], 'calendar')).toEqual(['tiles'])
    expect(flipWidget(['tiles'], 'calendar')).toEqual(['calendar', 'tiles'])
  })
})

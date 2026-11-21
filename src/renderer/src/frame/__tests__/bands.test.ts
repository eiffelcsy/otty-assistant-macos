// D-64: every band keeps the main column at its minimum or more, and the bands meet without gaps.
import { describe, expect, it } from 'vitest'
import { bandFor, columns, DETAILS_FROM, MAIN_MIN, MEDIUM_FROM, mainWidth, sameLayout, WIDE_FROM } from '../bands'

describe('bands (Spec 05)', () => {
  it('meet at 640, 712 and 980, with no gap and no overlap', () => {
    expect([639, 640, 711, 712, 979, 980].map(bandFor)).toEqual(['compact', 'rail', 'rail', 'medium', 'medium', 'wide'])
    expect(MEDIUM_FROM).toBe(712)
    expect(DETAILS_FROM).toBe(1248)
  })

  it('never leaves the main column under 400 from the rail up, with or without a list', () => {
    for (let w = 640; w <= 2000; w++) for (const list of [true, false]) expect(mainWidth(w, list), `${w} ${list}`).toBeGreaterThanOrEqual(MAIN_MIN)
  })

  it('shows the details pane from 980 on a screen with no list, and from 1248 with one', () => {
    expect(columns(WIDE_FROM, false).details).toBe(true)
    expect(columns(WIDE_FROM, true).details).toBe(false)
    expect(columns(1248, true)).toEqual({ nav: 'sidebar', list: true, details: true })
    expect(columns(420, true)).toEqual({ nav: 'none', list: false, details: false })
    expect(columns(760, true)).toEqual({ nav: 'rail', list: true, details: false })
  })

  it('calls two widths the same layout exactly when every column agrees', () => {
    for (let a = 360; a <= 1600; a += 7)
      for (const b of [a + 1, a + 40, a + 300])
        expect(sameLayout(a, b), `${a} ${b}`).toBe([true, false].every((l) => JSON.stringify(columns(a, l)) === JSON.stringify(columns(b, l))))
  })
})

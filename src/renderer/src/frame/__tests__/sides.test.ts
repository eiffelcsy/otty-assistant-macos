// @vitest-environment jsdom
// Spec 09, Part 3: the side columns' sizes, folds and the sidebar button.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { SIDES, canToggle, loadSides, saveSides, sideWidths, toggleSides } from '../sides'

// Node's own (experimental, unconfigured) localStorage hides jsdom's, so each test gets a fresh one in memory.
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear()
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('the side columns (Spec 09, Part 3)', () => {
  it('loadSides() with nothing stored equals SIDES', () => {
    expect(loadSides()).toEqual(SIDES)
  })

  it('clamps stored sizes and rejects wrong types', () => {
    localStorage.setItem('otty.sides', '{"nav":9999,"list":10,"navFolded":"yes","listHidden":true}')
    expect(loadSides()).toEqual({ nav: 288, navFolded: false, list: 200, listHidden: true })
  })

  it('falls back to SIDES on bad JSON', () => {
    localStorage.setItem('otty.sides', 'not json')
    expect(loadSides()).toEqual(SIDES)
  })

  it('saveSides then loadSides keeps the nav width', () => {
    saveSides({ ...SIDES, nav: 250 })
    expect(loadSides().nav).toBe(250)
  })

  it('works out the widths at each band', () => {
    expect(sideWidths(1280, true, false, SIDES)).toEqual({ nav: 'sidebar', navW: 216, list: true, listW: 248 })
    expect(sideWidths(1280, true, true, { ...SIDES, navFolded: true })).toEqual({ nav: 'rail', navW: 92, list: true, listW: 248 })
    expect(sideWidths(760, true, false, SIDES)).toEqual({ nav: 'rail', navW: 72, list: true, listW: 240 })
  })

  it('keeps the main column at 400', () => {
    expect(sideWidths(712, true, false, { ...SIDES, list: 360 }).listW).toBe(240)
    expect(sideWidths(1280, true, false, { ...SIDES, listHidden: true }).list).toBe(false)
  })

  it('the sidebar button closes and opens both sides', () => {
    expect(toggleSides(1280, true, SIDES)).toEqual({ ...SIDES, navFolded: true, listHidden: true })
    expect(toggleSides(1280, true, toggleSides(1280, true, SIDES))).toEqual(SIDES)
    expect(toggleSides(1280, false, { ...SIDES, listHidden: true })).toEqual({ ...SIDES, navFolded: true, listHidden: true })
    // The list was dragged away while the sidebar stayed: the button brings it back, never hides more.
    expect(toggleSides(1280, true, { ...SIDES, listHidden: true })).toEqual(SIDES)
    expect(toggleSides(1280, true, { ...SIDES, navFolded: true })).toEqual(SIDES)
  })

  it('canToggle is true only where a side can fold', () => {
    expect(canToggle(760, false)).toBe(false)
    expect(canToggle(760, true)).toBe(true)
    expect(canToggle(1280, false)).toBe(true)
    expect(canToggle(420, true)).toBe(false)
  })
})

import { LIST, MAIN_MIN, SIDEBAR, columns } from './bands'

// The side columns' sizes (Spec 09, Part 3): the sidebar's width or folded to the rail, the chat list's width or hidden.
// A layout convenience for this window, so it lives in its localStorage, never in settings.

export interface Sides {
  /** The sidebar's width while it isn't folded. */
  nav: number
  navFolded: boolean
  /** The chat list's width; null is the band's own. */
  list: number | null
  listHidden: boolean
}

export const NAV_MIN = 200
export const NAV_MAX = 288
/** A sidebar let go under this folds to the rail; a rail dragged past it opens. */
export const NAV_FOLD = 160
export const LIST_MIN = 200
export const LIST_MAX = 360
/** A list let go under this hides. */
export const LIST_HIDE = 140

export const SIDES: Sides = { nav: SIDEBAR, navFolded: false, list: null, listHidden: false }

const KEY = 'otty.sides'
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export function loadSides(): Sides {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Sides, unknown>>
    return {
      nav: typeof s.nav === 'number' && Number.isFinite(s.nav) ? clamp(Math.round(s.nav), NAV_MIN, NAV_MAX) : SIDES.nav,
      navFolded: s.navFolded === true,
      list: typeof s.list === 'number' && Number.isFinite(s.list) ? clamp(Math.round(s.list), LIST_MIN, LIST_MAX) : null,
      listHidden: s.listHidden === true
    }
  } catch {
    return SIDES
  }
}

export function saveSides(s: Sides): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage blocked: the sizes last until the window closes.
  }
}

export interface SideLayout {
  nav: 'none' | 'rail' | 'sidebar'
  navW: number
  /** Whether the list shows as a column now. */
  list: boolean
  listW: number
}

/** What the frame lays out at this width from the user's sides; the main column always keeps MAIN_MIN. */
export function sideWidths(width: number, hasList: boolean, roomy: boolean, s: Sides): SideLayout {
  const c = columns(width, hasList)
  const nav = c.nav === 'sidebar' && s.navFolded ? 'rail' : c.nav
  const navW = nav === 'sidebar' ? clamp(s.nav, NAV_MIN, NAV_MAX) : nav === 'rail' ? (roomy ? 92 : 72) : 0
  const room = Math.max(LIST_MIN, Math.min(LIST_MAX, width - navW - MAIN_MIN))
  const listW = clamp(s.list ?? (c.nav === 'sidebar' ? LIST.wide : LIST.medium), LIST_MIN, room)
  return { nav, navW, list: c.list && !s.listHidden, listW }
}

/** Whether the sidebar button has anything to fold here. */
export function canToggle(width: number, hasList: boolean): boolean {
  const c = columns(width, hasList)
  return c.nav === 'sidebar' || c.list
}

/** Whether every side that can open here is open (the sidebar, and the list on this screen). */
export function sidesOpen(width: number, hasList: boolean, s: Sides): boolean {
  const c = columns(width, hasList)
  return (c.nav !== 'sidebar' || !s.navFolded) && (!c.list || !s.listHidden)
}

/** The sidebar button and ⌃⌘S: if every side is open both close (the nav to the rail, the list away); if any is closed, both open. */
export function toggleSides(width: number, hasList: boolean, s: Sides): Sides {
  const open = sidesOpen(width, hasList, s)
  return { ...s, navFolded: open, listHidden: open }
}

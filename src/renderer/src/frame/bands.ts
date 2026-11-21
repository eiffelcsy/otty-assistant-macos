// The window's width alone sets the layout (D-64, Spec 05). A column joins only when the main column keeps its minimum,
// so every boundary is worked out from these widths, the same for every screen.

export type Band = 'compact' | 'rail' | 'medium' | 'wide'

export const MAIN_MIN = 400
export const RAIL = 72
export const SIDEBAR = 216
export const LIST = { medium: 240, wide: 248 } as const
export const DETAILS = 300

/** Under this, one screen at a time: the rail (72) would leave the main column under its minimum after a 168 margin. */
export const COMPACT_MAX = 640
/** The rail and a 240 list leave the main column its 400 from here. */
export const MEDIUM_FROM = RAIL + LIST.medium + MAIN_MIN
/** The sidebar takes over from the rail here: wide enough that the sidebar and list (464) still leave 516. */
export const WIDE_FROM = 980
/** With a list, the details pane joins once sidebar, list, a main column and the pane all fit. */
export const DETAILS_FROM = SIDEBAR + LIST.wide + 484 + DETAILS

export function bandFor(width: number): Band {
  if (width < COMPACT_MAX) return 'compact'
  if (width < MEDIUM_FROM) return 'rail'
  if (width < WIDE_FROM) return 'medium'
  return 'wide'
}

/** Two widths that lay out the same columns, so nothing needs to re-render between them. */
export const sameLayout = (a: number, b: number): boolean => bandFor(a) === bandFor(b) && a >= DETAILS_FROM === b >= DETAILS_FROM

/** Which parts are columns at this width, for a screen that has a list, or not. */
export function columns(width: number, hasList: boolean): { nav: 'none' | 'rail' | 'sidebar'; list: boolean; details: boolean } {
  const band = bandFor(width)
  return {
    nav: band === 'compact' ? 'none' : band === 'wide' ? 'sidebar' : 'rail',
    list: hasList && (band === 'medium' || band === 'wide'),
    details: band === 'wide' && (hasList ? width >= DETAILS_FROM : true)
  }
}

/** What's left for the main column. */
export function mainWidth(width: number, hasList: boolean): number {
  const c = columns(width, hasList)
  const nav = c.nav === 'rail' ? RAIL : c.nav === 'sidebar' ? SIDEBAR : 0
  const list = c.list ? (c.nav === 'sidebar' ? LIST.wide : LIST.medium) : 0
  return width - nav - list - (c.details ? DETAILS : 0)
}

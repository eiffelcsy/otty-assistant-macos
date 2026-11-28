// Home's widgets (D-86): which ones show, in this order. Needs you and the What left your Mac line aren't here: they
// are the safety surface and always show when they have something. A feature's own widget (D-55) would widen `valid`.

export const HOME_WIDGETS = ['calendar', 'today', 'after', 'tiles'] as const
export type HomeWidget = (typeof HOME_WIDGETS)[number]

export const WIDGET_NAMES: Record<HomeWidget, string> = {
  calendar: 'Calendar',
  today: 'Today',
  after: 'Looking after',
  tiles: 'My tiles'
}

/** A list main may keep: known widgets, each at most once. */
export const validWidgets = (x: unknown): x is HomeWidget[] =>
  Array.isArray(x) && x.every((w) => (HOME_WIDGETS as readonly unknown[]).includes(w)) && new Set(x).size === x.length

/** Turns one widget on or off, keeping the rest in Home's order. */
export const flipWidget = (on: HomeWidget[], w: HomeWidget): HomeWidget[] => HOME_WIDGETS.filter((x) => (x === w ? !on.includes(x) : on.includes(x)))

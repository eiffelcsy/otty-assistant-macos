/** The cove's four paintings (D-72), in the order they start through the day. */
export type CoveTime = 'dawn' | 'day' | 'golden' | 'night'

const STARTS: [hour: number, time: CoveTime][] = [
  [5, 'dawn'],
  [8, 'day'],
  [17, 'golden'],
  [19, 'night']
]

/** The painting for this moment on the Mac's clock. Dark mode is the night picture, never an inverted day. */
export function coveTime(now: Date, dark: boolean): CoveTime {
  if (dark) return 'night'
  const h = now.getHours()
  return STARTS.findLast(([start]) => h >= start)?.[1] ?? 'night'
}

/** Milliseconds until the next painting starts, so one timer is enough (no polling). */
export function untilNextCove(now: Date): number {
  const h = now.getHours()
  const at = new Date(now)
  at.setHours(STARTS.find(([start]) => start > h)?.[0] ?? 24 + STARTS[0][0], 0, 0, 0)
  return at.getTime() - now.getTime()
}

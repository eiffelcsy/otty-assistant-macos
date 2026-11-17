// Pause until (D-39): "for an hour" or "until tomorrow morning" on Pause everything, so a meeting doesn't need a
// remembered undo. Pure, so the menu bar, Activity and the tests agree on when Otty carries on.

export type PauseChoice = 'hour' | 'morning' | 'manual'

/** Tomorrow morning starts at this hour. */
const MORNING = 9
/** The longest a pause can be set to end by itself. Anything longer is "until I say". */
const LONGEST = 2 * 24 * 3600_000

/** When a pause should end by itself, or null for "until I say". */
export function pauseEnd(choice: PauseChoice, now = Date.now()): number | null {
  if (choice === 'hour') return now + 3600_000
  if (choice === 'manual') return null
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(MORNING, 0, 0, 0)
  return d.getTime()
}

/** A saved end, checked: in the future and within two days, or null ("until I say"). */
export function cleanPauseEnd(until: unknown, now = Date.now()): number | null {
  return typeof until === 'number' && Number.isFinite(until) && until > now && until - now <= LONGEST ? until : null
}

import type { CapStatus, MonthlyCap, Permissions, PublicSettings } from './types'

// "Is Otty able to do what I'll ask?" A shortcut that silently does nothing is the worst first impression, so the
// panel says plainly what's missing and offers the fix. Pure, so it's tested without a Mac.

export type HealthProblem =
  | { kind: 'accessibility' }
  | { kind: 'screen' }
  | { kind: 'hotkey'; hotkey: string; what: string }
  /** This month's limit is passed (D-33): the user's questions still go, and they should know why nothing starts by itself. */
  | { kind: 'cap'; cap: MonthlyCap }

const WHAT: Record<'askHotkey' | 'snapHotkey' | 'screenHotkey', string> = {
  askHotkey: 'asking about highlighted text',
  snapHotkey: 'snapping part of the screen',
  screenHotkey: 'capturing the whole screen'
}

/** The most important problem, or null when everything works. Accessibility first: without it, the main shortcut does nothing. */
export function healthProblem(
  perms: Permissions | null,
  s: Pick<PublicSettings, 'takenHotkeys' | 'askHotkey' | 'snapHotkey' | 'screenHotkey'>,
  cap: CapStatus | null = null
): HealthProblem | null {
  if (perms?.platform === 'darwin' && !perms.accessibility) return { kind: 'accessibility' }
  for (const key of ['askHotkey', 'snapHotkey', 'screenHotkey'] as const) {
    if (s.takenHotkeys.includes(s[key])) return { kind: 'hotkey', hotkey: s[key], what: WHAT[key] }
  }
  if (perms?.platform === 'darwin' && !perms.screen) return { kind: 'screen' }
  if (cap?.over) return { kind: 'cap', cap: { unit: cap.unit, limit: cap.limit } }
  return null
}

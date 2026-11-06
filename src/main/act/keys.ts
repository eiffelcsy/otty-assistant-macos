// Turning "⌘⇧4" or "Command+Shift+4" into what System Events needs. Pure, so it can be tested anywhere.

const MODIFIERS: Record<string, string> = {
  '⌘': 'command down',
  command: 'command down',
  cmd: 'command down',
  '⇧': 'shift down',
  shift: 'shift down',
  '⌥': 'option down',
  option: 'option down',
  alt: 'option down',
  '⌃': 'control down',
  control: 'control down',
  ctrl: 'control down'
}

/** Keys with no character. Return is left out on purpose: alone it would submit whatever is on screen. */
const KEY_CODES: Record<string, number> = {
  space: 49,
  tab: 48,
  esc: 53,
  escape: 53,
  delete: 51,
  backspace: 51,
  '⌫': 51,
  left: 123,
  '←': 123,
  right: 124,
  '→': 124,
  down: 125,
  '↓': 125,
  up: 126,
  '↑': 126
}

export interface Shortcut {
  modifiers: string[]
  /** A character to type, or a key code for a key without one. */
  key: string | number
}

/** Null if it isn't a shortcut Otty will press. It needs a modifier, so it can never type into a document. */
export function parseCombo(combo: string): Shortcut | null {
  const parts = combo
    .trim()
    .split(/[+\s]+|(?<=[⌘⇧⌥⌃])/)
    .map((p) => p.trim())
    .filter(Boolean)
  const key = parts.pop()?.toLowerCase()
  if (!key || !parts.length) return null
  const modifiers = parts.map((p) => MODIFIERS[p.toLowerCase()])
  if (modifiers.some((m) => !m)) return null
  if (key in KEY_CODES) return { modifiers: [...new Set(modifiers)], key: KEY_CODES[key] }
  return [...key].length === 1 ? { modifiers: [...new Set(modifiers)], key } : null
}

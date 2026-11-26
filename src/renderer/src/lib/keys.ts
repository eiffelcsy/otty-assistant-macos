const SYMBOLS: Record<string, string> = {
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  command: '⌘',
  cmd: '⌘',
  commandorcontrol: '⌘',
  cmdorctrl: '⌘',
  control: '⌃',
  ctrl: '⌃'
}

/** "Alt+Shift+Space" → "⌥ ⇧ Space" */
export function prettyKey(accel: string): string {
  return accel
    .split('+')
    .map((k) => SYMBOLS[k.toLowerCase()] ?? k)
    .join(' ')
}

/** "Alt+Shift+A" → "⌥⇧A", as a sentence says it (D-80). */
export const keyWords = (accel: string): string => prettyKey(accel).replace(/ /g, '')

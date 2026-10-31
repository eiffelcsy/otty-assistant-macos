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

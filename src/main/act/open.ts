import { existsSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join, relative, resolve } from 'path'

// What an `open` step may reach. Anything else is refused, and the step stays a manual one.

const SETTINGS_PANES = new Set([
  'com.apple.preference.security',
  'com.apple.preference.security?Privacy_Accessibility',
  'com.apple.preference.security?Privacy_ScreenCapture',
  'com.apple.preference.security?Privacy_Automation',
  'com.apple.preference.security?Privacy_AllFiles',
  'com.apple.preference.security?Privacy_Camera',
  'com.apple.preference.security?Privacy_Microphone',
  'com.apple.preference.security?Privacy_LocationServices',
  'com.apple.preference.security?Privacy_Contacts',
  'com.apple.preference.security?Privacy_Calendars',
  'com.apple.preference.notifications',
  'com.apple.preference.displays',
  'com.apple.preference.sound',
  'com.apple.preference.keyboard',
  'com.apple.preference.network',
  'com.apple.preference.battery',
  'com.apple.preferences.Bluetooth',
  'com.apple.preference.dock',
  'com.apple.preference.general'
])

const APP_FOLDERS = ['/Applications', '/Applications/Utilities', '/System/Applications', '/System/Applications/Utilities']

export type OpenTarget = { kind: 'url' | 'settings'; url: string } | { kind: 'app'; path: string } | { kind: 'reveal'; path: string }

/** Inside the user's home folder, with no `..` tricks. Documents are only ever shown in Finder, never opened. */
function inHome(target: string, home: string): string | null {
  const path = resolve(target.replace(/^~(?=\/|$)/, home))
  const rel = relative(home, path)
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? path : null
}

export function openTarget(raw: string, exists: (path: string) => boolean = existsSync, home = homedir()): OpenTarget | null {
  const target = raw.trim()
  if (/^https?:\/\//i.test(target)) {
    try {
      return { kind: 'url', url: new URL(target).href }
    } catch {
      return null
    }
  }
  if (target.startsWith('x-apple.systempreferences:')) {
    return SETTINGS_PANES.has(target.slice('x-apple.systempreferences:'.length)) ? { kind: 'settings', url: target } : null
  }
  if (target.startsWith('/') || target.startsWith('~')) {
    const path = inHome(target, home)
    return path && exists(path) ? { kind: 'reveal', path } : null
  }
  if (!/^[\p{L}\p{N} .+&'-]{1,60}$/u.test(target) || target.includes('..')) return null
  const name = target.replace(/\.app$/i, '')
  for (const folder of APP_FOLDERS) {
    const path = join(folder, `${name}.app`)
    if (exists(path)) return { kind: 'app', path }
  }
  return null
}

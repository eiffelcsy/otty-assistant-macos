/**
 * The smoke control's shape (D-47), shared with the specs by `import type` only.
 * Everything here crosses `electronApp.evaluate`, so it stays plain data.
 */

/** The app in front, as the frontmost-app script would report it. */
export interface SmokeApp {
  name: string
  bundleId: string
  title?: string
  /** For a browser: the page address its AppleScript would return. */
  url?: string
}

/** What the fake Mac reports. Specs change it with `control.mac(...)`. */
export interface SmokeMac {
  accessibility: boolean
  screen: boolean
  /** What ⌘C copies in the app in front. Null when nothing is highlighted. */
  selection: string | null
  front: SmokeApp | null
  /** A `data:image/png` for the next snip. Null cancels it, like Esc. */
  snip: string | null
  /** A `data:image/png` for the whole screen. */
  screenImage: string | null
  /** What an osascript run by a step card or a tool prints, and whether it fails. */
  script: { stdout: string; fail?: string }
  /** Where the mouse is, in screen points. Null means the middle of the main display, so window placement never
   * depends on where a real pointer happens to be. */
  cursor: { x: number; y: number } | null
}

/** Something Otty did to the Mac, recorded instead of done. */
export interface SmokeCall {
  kind: 'osascript' | 'open-external' | 'open-path' | 'show-in-folder' | 'notify' | 'login-item' | 'dialog'
  detail: string[]
  at: number
}

export interface SmokeSnapshot {
  ready: boolean
  /** Uncaught exceptions and unhandled rejections in main. */
  errors: string[]
  calls: SmokeCall[]
  /** Anything the hermetic guard refused. A test fails if this isn't empty. */
  blocked: string[]
  shortcuts: string[]
  offline: boolean
  clockOffset: number
}

import { app, Menu, screen, type BrowserWindow, type Rectangle } from 'electron'
import type { WindowState } from '../shared/types'
import { getStored, saveWindowBounds } from './settings'

// The Otty window's two states (D-65, Spec 06): one window that floats beside your work, or a normal Mac window with
// traffic lights, a Dock icon and a menu bar. Expand and Shrink move between them in one animated move, and each
// state reopens where it was left. The renderer only hears which state it's in, for the header's height.

export const ROOMY = { width: 1280, height: 800, minWidth: 720, minHeight: 520 } as const
export const FLOATING = { width: 420, height: 580, minWidth: 360, minHeight: 420 } as const

let state: WindowState = 'floating'
let moving = false

export const windowState = (): WindowState => state

/** The window's state, to the window. */
function tell(win: BrowserWindow): void {
  win.webContents.send('window:state', state)
}

/** Inside a connected display's work area, or not to be trusted. */
export function fits(b: Rectangle, displays = screen.getAllDisplays()): boolean {
  return displays.some((d) => b.x >= d.workArea.x && b.y >= d.workArea.y && b.x + b.width <= d.workArea.x + d.workArea.width && b.y + b.height <= d.workArea.y + d.workArea.height)
}

/** Where the roomy window goes: where it was, if that's still on a display; otherwise 1280 × 800, centred on the pointer's display. */
export function roomyBounds(): Rectangle {
  const saved = getStored().windowBounds?.roomy
  if (saved && fits(saved)) return saved
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const width = Math.min(ROOMY.width, wa.width)
  const height = Math.min(ROOMY.height, wa.height)
  return { x: Math.round(wa.x + (wa.width - width) / 2), y: Math.round(wa.y + (wa.height - height) / 2), width, height }
}

/** The floating window's size to come back to; its position is set beside the bubble when it opens. */
export function floatingSize(): { width: number; height: number } {
  const saved = getStored().windowBounds?.floating
  return saved ? { width: saved.width, height: saved.height } : { width: FLOATING.width, height: FLOATING.height }
}

/** What floats above everything, and what doesn't: the order matters for the Dock (W14). */
function behave(win: BrowserWindow, to: WindowState): void {
  if (to === 'roomy') {
    win.setAlwaysOnTop(false)
    win.setVisibleOnAllWorkspaces(false)
    win.setWindowButtonVisibility(true)
    win.setFullScreenable(true)
    win.setMinimumSize(ROOMY.minWidth, ROOMY.minHeight)
  } else {
    win.setFullScreenable(false)
    win.setWindowButtonVisibility(false)
    win.setMinimumSize(FLOATING.minWidth, FLOATING.minHeight)
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
}

const leaveFullScreen = (win: BrowserWindow) =>
  new Promise<void>((resolve) => {
    if (!win.isFullScreen()) return resolve()
    win.once('leave-full-screen', () => resolve())
    win.setFullScreen(false)
  })

/** Floating → roomy: the Dock icon and the menu bar first, then one move to the roomy bounds (Spec 06, Expand). */
export function expand(win: BrowserWindow): void {
  if (state === 'roomy' || moving) return
  moving = true
  saveWindowBounds('floating', win.getBounds())
  void app.dock?.show()
  state = 'roomy'
  behave(win, 'roomy')
  tell(win)
  if (!win.isVisible()) win.show()
  win.setBounds(roomyBounds(), true)
  win.focus()
  moving = false
}

/**
 * Roomy → floating: out of full screen, one move back, and only then the Dock icon goes, so it never flickers mid-move
 * (W14). `at` places the floating window, beside the bubble or the cursor.
 */
export async function shrink(win: BrowserWindow, at: (size: { width: number; height: number }) => { x: number; y: number }): Promise<void> {
  if (state === 'floating' || moving) return
  moving = true
  await leaveFullScreen(win)
  saveWindowBounds('roomy', win.getBounds())
  state = 'floating'
  tell(win)
  const size = floatingSize()
  win.setMinimumSize(FLOATING.minWidth, FLOATING.minHeight)
  win.setBounds({ ...at(size), ...size }, true)
  behave(win, 'floating')
  app.dock?.hide()
  moving = false
}

/** Closing the roomy window hides it and puts it back to floating for next time; the Dock icon leaves after it. */
export function closeRoomy(win: BrowserWindow): void {
  saveWindowBounds('roomy', win.getBounds())
  win.hide()
  state = 'floating'
  behave(win, 'floating')
  const size = floatingSize()
  win.setSize(size.width, size.height)
  tell(win)
  app.dock?.hide()
}

/** A move or resize ended: remember the place for this state. */
export function remember(win: BrowserWindow): void {
  if (!moving && !win.isFullScreen()) saveWindowBounds(state, win.getBounds())
}

/** The app menu, shown by macOS only while the Dock icon is (Spec 06): built once, and again when Pause changes. */
export function setAppMenu(template: Electron.MenuItemConstructorOptions[]): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** For the state on a new load of the window. */
export const sendState = tell

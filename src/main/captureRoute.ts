import { screen } from 'electron'
import type { PanelOpenPayload } from '../shared/types'
import { captureScreenshot, captureSelection, captureWholeScreen, frontmostApp, withWindowsHidden } from './capture'
import { celebrate } from './notify'
import { getPanel, getQuick, openPanel, prepareQuickAtCursor, quickIsCollecting, shownWindows } from './windows'

// D-45: where a capture goes. The three ways in (highlight, snip, whole screen) share one `deliver`: the open
// panel's tray, a collecting quick view, or a fresh window.

type Target = 'panel' | 'quick' | null

/** Where a new capture goes: the open panel's tray, a collecting quick view, or a fresh window. */
function captureTarget(): Target {
  if (getPanel()?.isVisible()) return 'panel'
  if (quickIsCollecting()) return 'quick'
  return null
}

/** Hotkey results go to the small quick view; permission notices need the full panel's cards. */
function openQuick(payload: PanelOpenPayload): void {
  if (payload.notice) return openPanel(payload, 'cursor')
  getPanel()?.hide()
  prepareQuickAtCursor()
  getQuick()?.webContents.send('quick:open', payload)
}

function deliver(payload: PanelOpenPayload, target: Target, fresh: 'quick' | 'bubble'): void {
  if (target === 'panel') {
    // Added to its tray, leaving the panel where it is.
    const panel = getPanel()
    panel?.webContents.send('panel:open', { ...payload, add: true } satisfies PanelOpenPayload)
    panel?.show()
    panel?.focus()
  } else if (target === 'quick') {
    // Added without moving or focusing it, so the next one still copies from the other app.
    if (payload.notice) return openPanel(payload, 'cursor')
    const quick = getQuick()
    if (payload.context) quick?.webContents.send('quick:open', { ...payload, add: true } satisfies PanelOpenPayload)
    quick?.showInactive()
  } else if (fresh === 'quick') openQuick(payload)
  else openPanel(payload, 'bubble')
}

export async function askAboutSelection(where: 'cursor' | 'bubble'): Promise<void> {
  const ownWindow = [getPanel(), getQuick()].find((w) => w?.isVisible() && w.isFocused())
  if (ownWindow) {
    // One of our windows is frontmost, so ⌘C would copy from Otty itself. Treat the hotkey as a toggle.
    if (where === 'cursor') ownWindow.hide()
    return
  }
  const target = captureTarget()
  // The hotkey's modifiers may still be held; give the user a beat to release them.
  const [payload, app] = await Promise.all([captureSelection(where === 'cursor' ? 220 : 0), frontmostApp()])
  payload.app = app
  deliver(payload, target, where === 'cursor' ? 'quick' : 'bubble')
}

export async function snipScreen(): Promise<void> {
  const panel = getPanel()
  const quick = getQuick()
  const target = captureTarget()
  // Out of the way of the crosshair; whichever was collecting comes back with the snip.
  panel?.hide()
  quick?.hide()
  const app = frontmostApp() // ask before the crosshair takes over the screen
  const payload = await captureScreenshot()
  payload.app = await app
  if (!payload.context && !payload.notice) {
    // The user pressed Esc.
    if (target === 'panel') panel?.show()
    if (target === 'quick') quick?.showInactive()
    return
  }
  deliver(payload, target, 'quick')
}

/** The display under the cursor, whole, with Otty's own windows left out. It follows the same tray rules as a snip. */
export async function snapWholeScreen(): Promise<void> {
  const target = captureTarget()
  const app = frontmostApp()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const payload = await withWindowsHidden(shownWindows(), () => captureWholeScreen(display))
  payload.app = await app
  deliver(payload, target, 'quick')
  if (payload.context) celebrate()
}

/** The menu bar's "Open chat", a second launch, or onboarding. */
export const openChat = (): void => openPanel({ context: null }, 'bubble')

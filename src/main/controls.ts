import { BrowserWindow, globalShortcut, Menu, Tray } from 'electron'
import type { SettingsUpdate } from '../shared/types'
import { pauseEnd, type PauseChoice } from '../shared/pauseUntil'
import { describeWhen } from '../shared/when'
import * as settings from './settings'
import { askAboutSelection, openChat, snapWholeScreen, snipScreen } from './captureRoute'
import { activityChanged, chat, forgetAllChats, jobs, tidyOldChats } from './core'
import { trayIcon } from './trayIcon'
import { getBubble, openSettings } from './windows'

// D-45: what the user controls Otty with outside its windows: the menu bar, the hotkeys, and applying settings.

let tray: Tray | null = null
/** The one timer for a pause that ends by itself (D-39). A sleeping Mac stalls it, so wake checks too. */
let pauseTimer: NodeJS.Timeout | null = null

/** "Otty (paused until today at 10:30 AM)". */
function pausedWords(): string {
  const { workPaused, workPausedUntil } = settings.getStored()
  if (!workPaused) return 'Otty'
  return workPausedUntil ? `Otty (paused until ${describeWhen(workPausedUntil)})` : 'Otty (paused)'
}

export function pause(choice: PauseChoice): void {
  applySettings({ workPaused: true, workPausedUntil: pauseEnd(choice) })
}

/** A pause whose time has come ends the same way as Let Otty carry on. Otherwise, the timer is set for its end. */
export function checkPause(): void {
  if (pauseTimer) clearTimeout(pauseTimer)
  pauseTimer = null
  const { workPaused, workPausedUntil } = settings.getStored()
  if (!workPaused || !workPausedUntil) return
  const left = workPausedUntil - Date.now()
  if (left <= 0) {
    applySettings({ workPaused: false })
    return
  }
  // setTimeout's limit is about 24 days; a pause is two days at most, so this is one timer, not a poll.
  pauseTimer = setTimeout(checkPause, left)
}

export function registerHotkeys(): void {
  globalShortcut.unregisterAll()
  const s = settings.getStored()
  const taken: string[] = []
  const bind = (accel: string, fn: () => void) => {
    try {
      if (!globalShortcut.register(accel, fn)) taken.push(accel)
    } catch (err) {
      console.warn(`Invalid hotkey ${accel}`, err)
    }
  }
  bind(s.askHotkey, () => void askAboutSelection('cursor'))
  bind(s.snapHotkey, () => void snipScreen())
  bind(s.screenHotkey, () => void snapWholeScreen())
  settings.setTakenHotkeys(taken)
}

export function menuTemplate(): Electron.MenuItemConstructorOptions[] {
  const s = settings.getStored()
  return [
    { label: 'Ask about highlighted text', accelerator: s.askHotkey, click: () => void askAboutSelection('bubble') },
    { label: 'Snap part of my screen', accelerator: s.snapHotkey, click: () => void snipScreen() },
    { label: 'Capture the whole screen', accelerator: s.screenHotkey, click: () => void snapWholeScreen() },
    { label: 'Open chat', click: openChat },
    { type: 'separator' },
    // The one stop control: whatever Otty is doing on its own stops, and nothing new starts, until this is undone.
    ...(s.workPaused
      ? [{ label: pausedWords().replace(/^Otty \((.*)\)$/, 'Otty is $1'), enabled: false }, { label: 'Let Otty carry on', click: () => applySettings({ workPaused: false }) }]
      : [
          {
            label: 'Pause everything Otty is doing',
            submenu: [
              { label: 'For an hour', click: () => pause('hour') },
              { label: 'Until tomorrow morning', click: () => pause('morning') },
              { label: 'Until I say', click: () => pause('manual') }
            ]
          }
        ]),
    {
      label: s.showBubble ? 'Hide floating Otty' : 'Show floating Otty',
      click: () => applySettings({ showBubble: !s.showBubble })
    },
    { label: 'Settings…', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit Otty', role: 'quit' }
  ]
}

function refreshTray(): void {
  tray?.setContextMenu(Menu.buildFromTemplate(menuTemplate()))
}

export function createTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip(pausedWords())
  refreshTray()
  checkPause()
}

export function applySettings(u: SettingsUpdate) {
  settings.update(u)
  if (u.rememberChats === false) void forgetAllChats()
  if (u.keepChats !== undefined) void tidyOldChats()
  if (u.workPaused !== undefined) {
    if (u.workPaused) chat.stopAll()
    void (u.workPaused ? jobs.hold() : jobs.release()).catch((err) => console.error('Could not change what Otty does on its own', err))
    tray?.setToolTip(pausedWords())
    void activityChanged(false)
    checkPause()
  }
  if (u.askHotkey !== undefined || u.snapHotkey !== undefined || u.screenHotkey !== undefined) registerHotkeys()
  if (u.showBubble !== undefined) {
    const b = getBubble()
    if (u.showBubble) b?.showInactive()
    else b?.hide()
  }
  refreshTray()
  // Every window shows the same settings, whichever one (or the menu bar) changed them.
  const now = settings.getPublic()
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('settings:changed', now)
  return now
}

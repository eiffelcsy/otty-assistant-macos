import { BrowserWindow, globalShortcut, Menu, Tray } from 'electron'
import type { SettingsUpdate } from '../shared/types'
import * as settings from './settings'
import { askAboutSelection, openChat, snapWholeScreen, snipScreen } from './captureRoute'
import { activityChanged, chat, forgetAllChats, jobs, tidyOldChats } from './core'
import { trayIcon } from './trayIcon'
import { getBubble, openSettings } from './windows'

// D-45: what the user controls Otty with outside its windows: the menu bar, the hotkeys, and applying settings.

let tray: Tray | null = null

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
    { label: s.workPaused ? 'Let Otty carry on' : 'Pause everything Otty is doing', click: () => applySettings({ workPaused: !s.workPaused }) },
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
  tray.setToolTip(settings.getStored().workPaused ? 'Otty (paused)' : 'Otty')
  refreshTray()
}

export function applySettings(u: SettingsUpdate) {
  settings.update(u)
  if (u.rememberChats === false) void forgetAllChats()
  if (u.keepChats !== undefined) void tidyOldChats()
  if (u.workPaused !== undefined) {
    if (u.workPaused) chat.stopAll()
    void (u.workPaused ? jobs.hold() : jobs.release()).catch((err) => console.error('Could not change what Otty does on its own', err))
    tray?.setToolTip(u.workPaused ? 'Otty (paused)' : 'Otty')
    void activityChanged(false)
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

import { app, globalShortcut, Menu, Tray } from 'electron'
import type { FrameCommand, SettingsUpdate } from '../shared/types'
import { pauseEnd, type PauseChoice } from '../shared/pauseUntil'
import { describeWhen } from '../shared/when'
import * as settings from './settings'
import { askAboutSelection, openChat, snapWholeScreen, snipScreen } from './captureRoute'
import { activityChanged, chat, forgetAllChats, jobs, tidyOldChats } from './core'
import { tellSettings } from './notify'
import { trayIcon } from './trayIcon'
import { setAppMenu } from './roomy'
import { expandPanel, getBubble, getPanel, openSettings, shrinkPanel } from './windows'

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

/** D-80: a shortcut that works, offered when one is taken. Each candidate is tried by registering it, then unregistered. */
const SUGGESTIONS: Record<'askHotkey' | 'snapHotkey' | 'screenHotkey', string[]> = {
  askHotkey: ['Alt+Space', 'Control+Alt+Space', 'Alt+Shift+A', 'Control+Shift+Space', 'Command+Shift+1'],
  snapHotkey: ['Alt+Shift+Space', 'Control+Alt+S', 'Alt+Shift+S', 'Command+Shift+2'],
  screenHotkey: ['Command+Alt+Shift+Space', 'Control+Alt+W', 'Alt+Shift+W', 'Command+Shift+3']
}

export function suggestHotkey(key: 'askHotkey' | 'snapHotkey' | 'screenHotkey'): string | null {
  const s = settings.getStored()
  const others = (['askHotkey', 'snapHotkey', 'screenHotkey'] as const).filter((k) => k !== key).map((k) => s[k])
  for (const accel of SUGGESTIONS[key]) {
    if (others.includes(accel)) continue
    let free = false
    try {
      free = globalShortcut.register(accel, () => {})
    } catch {
      free = false
    } finally {
      // Only a registration this test made is undone: Otty's own shortcuts stay as they are.
      if (free) globalShortcut.unregister(accel)
    }
    if (free) return accel
  }
  return null
}

type Item = Electron.MenuItemConstructorOptions

/** The one stop control: whatever Otty is doing on its own stops, and nothing new starts, until this is undone. The menu bar icon, the app menu and the Dock menu all build it here, so they never disagree. */
export function pauseItems(label = 'Pause everything Otty is doing'): Item[] {
  if (settings.getStored().workPaused)
    return [{ label: pausedWords().replace(/^Otty \((.*)\)$/, 'Otty is $1'), enabled: false }, { label: 'Let Otty carry on', click: () => applySettings({ workPaused: false }) }]
  return [
    {
      label,
      submenu: [
        { label: 'For an hour', click: () => pause('hour') },
        { label: 'Until tomorrow morning', click: () => pause('morning') },
        { label: 'Until I say', click: () => pause('manual') }
      ]
    }
  ]
}

/** Something the Otty window does on its own screen: the renderer owns navigation (D-64), so the menu asks it. */
function frame(command: FrameCommand): void {
  const panel = getPanel()
  if (!panel) return
  panel.show()
  panel.webContents.send('frame:command', command)
}

/** Opening Otty itself (Applications, the Dock, the menu bar): the roomy window, on Home (Spec 06). Expand keeps its screen. */
export function openRoomy(): void {
  expandPanel()
  frame('home')
}

export function menuTemplate(): Item[] {
  const s = settings.getStored()
  return [
    { label: 'Ask about highlighted text', accelerator: s.askHotkey, click: () => void askAboutSelection('bubble') },
    { label: 'Snap part of my screen', accelerator: s.snapHotkey, click: () => void snipScreen() },
    { label: 'Capture the whole screen', accelerator: s.screenHotkey, click: () => void snapWholeScreen() },
    { label: 'Open chat', click: openChat },
    { label: 'Open the Otty window', click: openRoomy },
    { type: 'separator' },
    ...pauseItems(),
    {
      label: s.showBubble ? 'Hide floating Otty' : 'Show floating Otty',
      click: () => applySettings({ showBubble: !s.showBubble })
    },
    { label: 'Settings…', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit Otty', role: 'quit' }
  ]
}

/**
 * The app menu (D-65, Spec 06). macOS shows it only while the Dock icon is, so it's set once and kept current. Keys the
 * window handles itself (⌘N, ⌘1–⌘4, ⌘[…) are shown but not registered here, so they still reach the window.
 */
export function appMenuTemplate(): Item[] {
  const s = settings.getStored()
  const shown = (accelerator: string) => ({ accelerator, registerAccelerator: false })
  return [
    {
      label: 'Otty',
      submenu: [
        { role: 'about', label: 'About Otty' },
        { type: 'separator' },
        { label: 'Settings…', ...shown('Cmd+,'), click: () => frame('settings') },
        { type: 'separator' },
        ...pauseItems('Pause everything'),
        { label: s.showBubble ? 'Hide floating Otty' : 'Show floating Otty', click: () => applySettings({ showBubble: !s.showBubble }) },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Otty' },
        { role: 'hideOthers' },
        { role: 'unhide', label: 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Otty' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New chat', ...shown('Cmd+N'), click: () => frame('new') },
        { label: 'Ask about highlighted text', ...shown(s.askHotkey), click: () => void askAboutSelection('bubble') },
        { label: 'Snap part of my screen', ...shown(s.snapHotkey), click: () => void snipScreen() },
        { label: 'Capture the whole screen', ...shown(s.screenHotkey), click: () => void snapWholeScreen() },
        { label: 'Attach files…', click: () => frame('attach') },
        { type: 'separator' },
        { label: 'Close window', role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', ...shown('Cmd+F'), click: () => frame('find') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Home', ...shown('Cmd+1'), click: () => frame('home') },
        { label: 'Chats', ...shown('Cmd+2'), click: () => frame('chat') },
        { label: 'Logbook', ...shown('Cmd+3'), click: () => frame('logbook') },
        { label: 'Notebook', ...shown('Cmd+4'), click: () => frame('notebook') },
        { label: 'Calendar', ...shown('Cmd+5'), click: () => frame('calendar') },
        { label: 'Pouch', ...shown('Cmd+6'), click: () => frame('pouch') },
        { type: 'separator' },
        { label: 'Hide sidebar', ...shown('Ctrl+Cmd+S'), click: () => frame('sidebar') },
        { type: 'separator' },
        { label: 'Shrink to floating', ...shown('Shift+Cmd+E'), click: shrinkPanel },
        { role: 'togglefullscreen', label: 'Enter full screen' }
      ]
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        { label: 'How to use Otty', click: () => frame('help') },
        { label: 'Copy diagnostics…', click: () => frame('help') }
      ]
    }
  ]
}

/** The Dock icon's own menu, while the roomy window shows it (Spec 06). */
export function dockMenuTemplate(): Item[] {
  return [{ label: 'New chat', click: () => frame('new') }, ...pauseItems('Pause everything')]
}

function refreshTray(): void {
  tray?.setContextMenu(Menu.buildFromTemplate(menuTemplate()))
  setAppMenu(appMenuTemplate())
  app.dock?.setMenu(Menu.buildFromTemplate(dockMenuTemplate()))
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
  tellSettings(now)
  return now
}

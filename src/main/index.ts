import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, shell, Tray } from 'electron'
import type { AppInfo, BubbleState, ChatEvent, PanelOpenPayload, PermissionKind, ScreenContext, SettingsUpdate } from '../shared/types'
import * as settings from './settings'
import { captureScreenshot, captureSelection, frontmostApp } from './capture'
import * as chats from './chats'
import { getPermissions, openPermissionSettings } from './permissions'
import { ChatSession, explainTerm, testConnection } from './llm'
import { trayIcon } from './trayIcon'
import {
  createBubble,
  createPanel,
  createQuick,
  endBubbleDrag,
  expandQuickToPanel,
  getBubble,
  getPanel,
  getQuick,
  prepareQuickAtCursor,
  resizeQuick,
  showPanelAtCursor,
  showPanelByBubble,
  startBubbleDrag
} from './windows'

let tray: Tray | null = null
let happyTimer: NodeJS.Timeout | null = null

function setBubbleState(state: BubbleState): void {
  getBubble()?.webContents.send('bubble:state', state)
}

function setBadge(on: boolean): void {
  getBubble()?.webContents.send('bubble:badge', on)
}

function forward(e: ChatEvent): void {
  getPanel()?.webContents.send('chat:event', e)
  getQuick()?.webContents.send('chat:event', e)
  if (happyTimer) clearTimeout(happyTimer)
  if (e.type === 'start') setBubbleState('thinking')
  if (e.type === 'error') setBubbleState('idle')
  // The quick view hides when it loses focus, so an answer can finish with nobody looking.
  const seen = getPanel()?.isVisible() || getQuick()?.isVisible()
  if ((e.type === 'done' || e.type === 'error') && !seen) setBadge(true)
  if (e.type === 'done') {
    setBubbleState('happy')
    happyTimer = setTimeout(() => setBubbleState('idle'), 2500)
  }
}

const chat = new ChatSession(forward)

function resetChat(): void {
  chat.reset()
  forward({ type: 'reset' })
}

function openPanel(payload: PanelOpenPayload, where: 'cursor' | 'bubble'): void {
  getQuick()?.hide()
  getPanel()?.webContents.send('panel:open', payload)
  if (where === 'bubble') showPanelByBubble()
  else showPanelAtCursor()
}

/** Hotkey results go to the small quick view; permission notices need the full panel's cards. */
function openQuick(payload: PanelOpenPayload): void {
  if (payload.notice) return openPanel(payload, 'cursor')
  getPanel()?.hide()
  prepareQuickAtCursor()
  getQuick()?.webContents.send('quick:open', payload)
}

async function askAboutSelection(where: 'cursor' | 'bubble'): Promise<void> {
  const panel = getPanel()
  const quick = getQuick()
  const ownWindow = [panel, quick].find((w) => w?.isVisible() && w.isFocused())
  if (ownWindow) {
    // One of our windows is frontmost, so ⌘C would copy from Otty itself. Treat the hotkey as a toggle.
    if (where === 'cursor') ownWindow.hide()
    return
  }
  // The hotkey's modifiers may still be held; give the user a beat to release them.
  const [payload, app] = await Promise.all([captureSelection(where === 'cursor' ? 220 : 0), frontmostApp()])
  payload.app = app
  if (where === 'cursor') openQuick(payload)
  else openPanel(payload, where)
}

async function snipScreen(): Promise<void> {
  const panel = getPanel()
  const wasVisible = panel?.isVisible() ?? false
  panel?.hide()
  getQuick()?.hide()
  const app = frontmostApp() // ask before the crosshair takes over the screen
  const payload = await captureScreenshot()
  payload.app = await app
  if (!payload.context && !payload.notice) {
    if (wasVisible) panel?.show()
    return // user pressed Esc
  }
  openQuick(payload)
}

function registerHotkeys(): void {
  globalShortcut.unregisterAll()
  const s = settings.getStored()
  const bind = (accel: string, fn: () => void) => {
    try {
      if (!globalShortcut.register(accel, fn)) console.warn(`Hotkey ${accel} is taken by another app`)
    } catch (err) {
      console.warn(`Invalid hotkey ${accel}`, err)
    }
  }
  bind(s.askHotkey, () => void askAboutSelection('cursor'))
  bind(s.snapHotkey, () => void snipScreen())
}

function menuTemplate(): Electron.MenuItemConstructorOptions[] {
  const s = settings.getStored()
  return [
    { label: 'Ask about highlighted text', accelerator: s.askHotkey, click: () => void askAboutSelection('bubble') },
    { label: 'Snap part of my screen', accelerator: s.snapHotkey, click: () => void snipScreen() },
    { label: 'Open chat', click: () => openPanel({ context: null }, 'bubble') },
    { type: 'separator' },
    {
      label: s.showBubble ? 'Hide floating Otty' : 'Show floating Otty',
      click: () => applySettings({ showBubble: !s.showBubble })
    },
    { label: 'Settings…', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit Otty', role: 'quit' }
  ]
}

function openSettings(): void {
  getPanel()?.webContents.send('panel:open', { context: null, notice: 'open-settings' } satisfies PanelOpenPayload)
  showPanelByBubble()
}

function refreshTray(): void {
  tray?.setContextMenu(Menu.buildFromTemplate(menuTemplate()))
}

function applySettings(u: SettingsUpdate) {
  const result = settings.update(u)
  if (u.rememberChats === false) chats.clearChats()
  if (u.askHotkey !== undefined || u.snapHotkey !== undefined) registerHotkeys()
  if (u.showBubble !== undefined) {
    const b = getBubble()
    if (u.showBubble) b?.showInactive()
    else b?.hide()
  }
  refreshTray()
  return result
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => settings.getPublic())
  ipcMain.handle('settings:save', (_e, u: SettingsUpdate) => applySettings(u))
  ipcMain.handle('settings:test', () => testConnection())
  ipcMain.handle('permissions:get', () => getPermissions())
  ipcMain.handle('permissions:open', (_e, kind: PermissionKind) => openPermissionSettings(kind))

  ipcMain.handle(
    'chat:send',
    (_e, text: string, ctx: ScreenContext | null, opts?: { app?: AppInfo | null; fresh?: boolean }) => {
      if (opts?.fresh) resetChat()
      void chat.send(text, ctx, opts?.app ?? null)
    }
  )
  ipcMain.handle('chat:stop', () => chat.stop())
  ipcMain.handle('chat:reset', () => resetChat())
  ipcMain.handle('chats:list', () => chats.listChats())
  ipcMain.handle('chats:open', (_e, id: string) => chat.open(id))
  ipcMain.handle('chats:delete', (_e, id: string) => {
    chats.deleteChat(id)
    if (chat.threadId === id) resetChat()
  })
  ipcMain.handle('chats:clear', () => {
    chats.clearChats()
    resetChat()
  })
  ipcMain.handle('chat:confirm', (_e, id: string, allow: boolean) => chat.respondConfirm(id, allow))
  ipcMain.handle('chat:explain', (_e, term: string, around: string) => explainTerm(term, around))

  ipcMain.handle('capture:selection', async () => {
    // Invoked from the panel's button: hide first so the previous app regains focus.
    getPanel()?.hide()
    await new Promise((r) => setTimeout(r, 250))
    const [payload, app] = await Promise.all([captureSelection(), frontmostApp()])
    payload.app = app
    showPanelAtCursor()
    return payload
  })
  ipcMain.handle('capture:screenshot', async () => {
    getPanel()?.hide()
    const app = frontmostApp()
    const payload = await captureScreenshot()
    payload.app = await app
    showPanelAtCursor()
    return payload
  })

  ipcMain.handle('panel:close', () => getPanel()?.hide())
  ipcMain.handle('quick:close', () => getQuick()?.hide())
  ipcMain.handle('quick:expand', () => {
    getPanel()?.webContents.send('panel:open', { context: null } satisfies PanelOpenPayload)
    expandQuickToPanel()
  })
  ipcMain.on('quick:resize', (_e, height: number) => resizeQuick(height))
  ipcMain.handle('shell:open', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('clipboard:write', (_e, text: string) => clipboard.writeText(text))

  ipcMain.on('bubble:drag', (_e, phase: 'start' | 'end') => {
    if (phase === 'start') return startBubbleDrag()
    if (!endBubbleDrag()) void askAboutSelection('bubble') // a click, not a drag
  })
  ipcMain.on('bubble:menu', () => {
    const b = getBubble()
    if (b) Menu.buildFromTemplate(menuTemplate()).popup({ window: b })
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    app.dock?.hide() // Otty lives in the bubble + menu bar, not the Dock.
    registerIpc()
    createPanel().on('show', () => setBadge(false))
    createQuick().on('show', () => setBadge(false))
    createBubble()
    registerHotkeys()

    tray = new Tray(trayIcon())
    tray.setToolTip('Otty')
    refreshTray()

    if (!settings.getStored().onboarded) {
      getPanel()?.once('ready-to-show', () => openPanel({ context: null }, 'bubble'))
    }
  })

  app.on('second-instance', () => openPanel({ context: null }, 'bubble'))
  app.on('will-quit', () => globalShortcut.unregisterAll())
  // Keep running with no windows focused; Otty quits only from its menu.
  app.on('window-all-closed', () => {
    if (BrowserWindow.getAllWindows().length === 0) app.quit()
  })
}

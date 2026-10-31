import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import type { BubbleState, ChatEvent, PanelOpenPayload, PermissionKind, ScreenContext, SettingsUpdate } from '../shared/types'
import * as settings from './settings'
import { captureScreenshot, captureSelection } from './capture'
import { getPermissions, openPermissionSettings } from './permissions'
import { ChatSession, explainTerm, testConnection } from './llm'
import {
  createBubble,
  createPanel,
  endBubbleDrag,
  getBubble,
  getPanel,
  showPanelAtCursor,
  showPanelByBubble,
  startBubbleDrag
} from './windows'

let tray: Tray | null = null
let happyTimer: NodeJS.Timeout | null = null

function setBubbleState(state: BubbleState): void {
  getBubble()?.webContents.send('bubble:state', state)
}

function forward(e: ChatEvent): void {
  getPanel()?.webContents.send('chat:event', e)
  if (happyTimer) clearTimeout(happyTimer)
  if (e.type === 'start') setBubbleState('thinking')
  if (e.type === 'error') setBubbleState('idle')
  if (e.type === 'done') {
    setBubbleState('happy')
    happyTimer = setTimeout(() => setBubbleState('idle'), 2500)
  }
}

const chat = new ChatSession(forward)

function openPanel(payload: PanelOpenPayload, where: 'cursor' | 'bubble'): void {
  getPanel()?.webContents.send('panel:open', payload)
  if (where === 'bubble') showPanelByBubble()
  else showPanelAtCursor()
}

async function askAboutSelection(where: 'cursor' | 'bubble'): Promise<void> {
  const panel = getPanel()
  if (panel?.isVisible() && panel.isFocused()) {
    // Our own panel is frontmost, so ⌘C would copy from Otty itself. Treat the hotkey as a toggle.
    if (where === 'cursor') panel.hide()
    return
  }
  // The hotkey's modifiers may still be held; give the user a beat to release them.
  const payload = await captureSelection(where === 'cursor' ? 220 : 0)
  openPanel(payload, where)
}

async function snipScreen(): Promise<void> {
  const panel = getPanel()
  const wasVisible = panel?.isVisible() ?? false
  panel?.hide()
  const payload = await captureScreenshot()
  if (!payload.context && !payload.notice) {
    if (wasVisible) panel?.show()
    return // user pressed Esc
  }
  openPanel(payload, 'cursor')
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

  ipcMain.handle('chat:send', (_e, text: string, ctx: ScreenContext | null) => {
    void chat.send(text, ctx)
  })
  ipcMain.handle('chat:stop', () => chat.stop())
  ipcMain.handle('chat:reset', () => chat.reset())
  ipcMain.handle('chat:confirm', (_e, id: string, allow: boolean) => chat.respondConfirm(id, allow))
  ipcMain.handle('chat:explain', (_e, term: string, around: string) => explainTerm(term, around))

  ipcMain.handle('capture:selection', async () => {
    // Invoked from the panel's button: hide first so the previous app regains focus.
    getPanel()?.hide()
    await new Promise((r) => setTimeout(r, 250))
    const payload = await captureSelection()
    showPanelAtCursor()
    return payload
  })
  ipcMain.handle('capture:screenshot', async () => {
    getPanel()?.hide()
    const payload = await captureScreenshot()
    showPanelAtCursor()
    return payload
  })

  ipcMain.handle('panel:close', () => getPanel()?.hide())
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
    createPanel()
    createBubble()
    registerHotkeys()

    tray = new Tray(nativeImage.createEmpty())
    tray.setTitle('🦦')
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

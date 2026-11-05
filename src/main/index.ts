import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, shell, Tray } from 'electron'
import type {
  AnswerLanguage,
  BubbleState,
  ChatEvent,
  PanelOpenPayload,
  Capture,
  PermissionKind,
  QuickState,
  SendOptions,
  SettingsUpdate
} from '../shared/types'
import * as settings from './settings'
import { captureScreenshot, captureSelection, captureWholeScreen, frontmostApp, withWindowsHidden } from './capture'
import { chatStore, closeStore, pruneOldChats } from './store'
import { discardFile, pickFiles, readFile, registerFiles } from './files'
import { getPermissions, openPermissionSettings } from './permissions'
import { ChatSession, explainTerm, testConnection } from './llm'
import { copyText } from './tools'
import { startMetrics } from './metrics'
import { trayIcon } from './trayIcon'
import {
  createBubble,
  createPanel,
  createQuick,
  endBubbleDrag,
  expandQuickToPanel,
  getBubble,
  getPanel,
  getPickup,
  getQuick,
  pickupPicture,
  prepareQuickAtCursor,
  quickIsCollecting,
  readPickup,
  resizeQuick,
  setQuickState,
  showPanelAtCursor,
  shownWindows,
  showPanelByBubble,
  showPickup,
  startBubbleDrag
} from './windows'

/** Recent chats shows this many; search reaches the rest. */
const RECENT_CHATS = 500

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

/** "Forget all chats", or turning off "Remember my chats": the open one goes too, even mid-answer. */
async function forgetAllChats(): Promise<void> {
  chat.forget(chat.threadId)
  forward({ type: 'reset' })
  await chatStore().clear()
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

/** The panel is open: add the capture to its tray, leaving the panel where it is. */
function addToPanel(payload: PanelOpenPayload): void {
  const panel = getPanel()
  panel?.webContents.send('panel:open', { ...payload, add: true } satisfies PanelOpenPayload)
  panel?.show()
  panel?.focus()
}

/** The quick view is collecting: add the capture without moving or focusing it, so the next one still copies from the other app. */
function addToQuick(payload: PanelOpenPayload): void {
  if (payload.notice) return openPanel(payload, 'cursor')
  const quick = getQuick()
  if (payload.context) quick?.webContents.send('quick:open', { ...payload, add: true } satisfies PanelOpenPayload)
  quick?.showInactive()
}

/** Where a new capture goes: the open panel's tray, a collecting quick view, or a fresh window. */
function captureTarget(): 'panel' | 'quick' | null {
  if (getPanel()?.isVisible()) return 'panel'
  if (quickIsCollecting()) return 'quick'
  return null
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
  const target = captureTarget()
  // The hotkey's modifiers may still be held; give the user a beat to release them.
  const [payload, app] = await Promise.all([captureSelection(where === 'cursor' ? 220 : 0), frontmostApp()])
  payload.app = app
  if (target === 'panel') addToPanel(payload)
  else if (target === 'quick') addToQuick(payload)
  else if (where === 'cursor') openQuick(payload)
  else openPanel(payload, where)
}

async function snipScreen(): Promise<void> {
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
  if (target === 'panel') addToPanel(payload)
  else if (target === 'quick') addToQuick(payload)
  else openQuick(payload)
}

/** The display under the cursor, whole, with Otty's own windows left out. It follows the same tray rules as a snip. */
async function snapWholeScreen(): Promise<void> {
  const target = captureTarget()
  const app = frontmostApp()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const payload = await withWindowsHidden(shownWindows(), () => captureWholeScreen(display))
  payload.app = await app
  if (target === 'panel') addToPanel(payload)
  else if (target === 'quick') addToQuick(payload)
  else openQuick(payload)
  if (!payload.context) return
  setBubbleState('happy')
  if (happyTimer) clearTimeout(happyTimer)
  happyTimer = setTimeout(() => setBubbleState('idle'), 2500)
}

function registerHotkeys(): void {
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

function menuTemplate(): Electron.MenuItemConstructorOptions[] {
  const s = settings.getStored()
  return [
    { label: 'Ask about highlighted text', accelerator: s.askHotkey, click: () => void askAboutSelection('bubble') },
    { label: 'Snap part of my screen', accelerator: s.snapHotkey, click: () => void snipScreen() },
    { label: 'Capture the whole screen', accelerator: s.screenHotkey, click: () => void snapWholeScreen() },
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
  settings.update(u)
  if (u.rememberChats === false) void forgetAllChats()
  if (u.keepChats !== undefined) void pruneOldChats()
  if (u.askHotkey !== undefined || u.snapHotkey !== undefined || u.screenHotkey !== undefined) registerHotkeys()
  if (u.showBubble !== undefined) {
    const b = getBubble()
    if (u.showBubble) b?.showInactive()
    else b?.hide()
  }
  refreshTray()
  return settings.getPublic()
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => settings.getPublic())
  ipcMain.handle('settings:save', (_e, u: SettingsUpdate) => applySettings(u))
  ipcMain.handle('settings:test', () => testConnection())
  ipcMain.handle('permissions:get', () => getPermissions())
  ipcMain.handle('permissions:open', (_e, kind: PermissionKind) => openPermissionSettings(kind))

  ipcMain.handle(
    'chat:send',
    (_e, text: string, captures: Capture[], opts?: SendOptions) => {
      if (opts?.fresh) resetChat()
      void chat.send(text, Array.isArray(captures) ? captures : [], opts?.app ?? null, { language: opts?.language, action: opts?.action, files: opts?.files })
    }
  )
  ipcMain.handle('chat:stop', () => chat.stop())
  ipcMain.handle('chat:reset', () => resetChat())
  ipcMain.handle('chats:list', () => chatStore().list({ limit: RECENT_CHATS }))
  ipcMain.handle('chats:open', (_e, id: string, focusMessageId?: string) => chat.open(id, focusMessageId))
  ipcMain.handle('chats:search', (_e, q: string) => chatStore().search(String(q).slice(0, 200)))
  ipcMain.handle('chats:delete', async (_e, id: string) => {
    const open = chat.threadId === id
    chat.forget(id)
    await chatStore().delete(id)
    if (open) forward({ type: 'reset' })
  })
  ipcMain.handle('chats:clear', () => forgetAllChats())
  ipcMain.handle('files:pick', (e) => pickFiles(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle('files:register', (_e, paths: unknown) => registerFiles(paths))
  ipcMain.handle('files:read', (_e, id: string) => readFile(String(id)))
  ipcMain.handle('files:discard', (_e, id: string) => discardFile(String(id)))
  ipcMain.handle('chat:confirm', (_e, id: string, allow: boolean) => chat.respondConfirm(id, allow))
  ipcMain.handle('chat:explain', (_e, term: string, around: string, language?: AnswerLanguage) =>
    explainTerm(term, around, language)
  )

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
  ipcMain.on('quick:state', (_e, state: QuickState) => setQuickState(state))
  ipcMain.handle('shell:open', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('clipboard:write', async (_e, text: string) => void (await copyText(text)))
  ipcMain.handle('pickup:open', (_e, dataUrl: string) => showPickup(String(dataUrl)))
  ipcMain.handle('pickup:picture', () => pickupPicture())
  ipcMain.handle('pickup:read', () => readPickup())
  ipcMain.handle('pickup:close', () => getPickup()?.close())

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
    startMetrics()
    registerIpc()
    createPanel().on('show', () => setBadge(false))
    createQuick().on('show', () => setBadge(false))
    createBubble()
    registerHotkeys()
    // Open the database (and import any chats.json) now, off the first click's path, then tidy old chats.
    setImmediate(() => {
      chatStore()
      void pruneOldChats().catch((err) => console.error('Could not forget old chats', err))
    })

    tray = new Tray(trayIcon())
    tray.setToolTip('Otty')
    refreshTray()

    if (!settings.getStored().onboarded) {
      getPanel()?.once('ready-to-show', () => openPanel({ context: null }, 'bubble'))
    }
  })

  app.on('second-instance', () => openPanel({ context: null }, 'bubble'))
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    closeStore()
  })
  // Keep running with no windows focused; Otty quits only from its menu.
  app.on('window-all-closed', () => {
    if (BrowserWindow.getAllWindows().length === 0) app.quit()
  })
}

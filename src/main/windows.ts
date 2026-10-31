import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { getStored, saveBubblePosition } from './settings'

const BUBBLE_SIZE = 84
const PANEL_W = 420
const PANEL_H = 580
const GAP = 14

let bubble: BrowserWindow | null = null
let panel: BrowserWindow | null = null

function load(win: BrowserWindow, view: 'bubble' | 'panel'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(`${devUrl}?view=${view}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
}

function secure(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
}

const webPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}

export function createBubble(): BrowserWindow {
  const wa = screen.getPrimaryDisplay().workArea
  const saved = getStored().bubblePosition
  const pos = saved && onSomeDisplay(saved) ? saved : { x: wa.x + wa.width - BUBBLE_SIZE - 24, y: wa.y + wa.height - BUBBLE_SIZE - 24 }

  bubble = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    focusable: process.platform !== 'darwin', // non-activating on macOS keeps the user's selection
    show: false,
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences
  })
  bubble.setAlwaysOnTop(true, 'floating')
  bubble.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  secure(bubble)
  load(bubble, 'bubble')
  bubble.once('ready-to-show', () => getStored().showBubble && bubble?.showInactive())
  bubble.on('closed', () => (bubble = null))
  return bubble
}

export function createPanel(): BrowserWindow {
  panel = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    minWidth: 360,
    minHeight: 420,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences
  })
  panel.setAlwaysOnTop(true, 'floating')
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  secure(panel)
  load(panel, 'panel')
  panel.on('closed', () => (panel = null))
  return panel
}

export const getBubble = () => bubble
export const getPanel = () => panel

function onSomeDisplay(p: { x: number; y: number }): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) => p.x >= a.x && p.y >= a.y && p.x < a.x + a.width && p.y < a.y + a.height)
}

/** Show the panel next to a point (the cursor or the bubble), clamped on-screen. */
export function showPanelAt(anchor: { x: number; y: number }, anchorSize = 0): void {
  if (!panel) return
  const wa = screen.getDisplayNearestPoint(anchor).workArea
  const [w, h] = panel.getSize()

  let x = anchor.x + anchorSize + GAP
  if (x + w > wa.x + wa.width) x = anchor.x - w - GAP
  let y = anchor.y + GAP
  if (y + h > wa.y + wa.height) y = wa.y + wa.height - h - GAP

  x = Math.max(wa.x + GAP, Math.min(x, wa.x + wa.width - w - GAP))
  y = Math.max(wa.y + GAP, y)

  panel.setPosition(Math.round(x), Math.round(y))
  panel.show()
  panel.focus()
}

export function showPanelAtCursor(): void {
  showPanelAt(screen.getCursorScreenPoint())
}

export function showPanelByBubble(): void {
  if (!bubble || !bubble.isVisible()) return showPanelAtCursor()
  const [bx, by] = bubble.getPosition()
  // Prefer opening above-left of the bubble since it usually sits bottom-right.
  if (!panel) return
  const wa = screen.getDisplayNearestPoint({ x: bx, y: by }).workArea
  const [w, h] = panel.getSize()
  let x = bx - w - GAP
  if (x < wa.x) x = bx + BUBBLE_SIZE + GAP
  let y = by + BUBBLE_SIZE - h
  y = Math.max(wa.y + GAP, Math.min(y, wa.y + wa.height - h - GAP))
  x = Math.max(wa.x + GAP, Math.min(x, wa.x + wa.width - w - GAP))
  panel.setPosition(Math.round(x), Math.round(y))
  panel.show()
  panel.focus()
}

// --- Bubble dragging: main polls the cursor while the mouse is held, so fast drags never "drop" the otter.

let dragTimer: NodeJS.Timeout | null = null
let dragOrigin: { cx: number; cy: number; wx: number; wy: number } | null = null
let dragMoved = false

export function startBubbleDrag(): void {
  if (!bubble) return
  const c = screen.getCursorScreenPoint()
  const [wx, wy] = bubble.getPosition()
  dragOrigin = { cx: c.x, cy: c.y, wx, wy }
  dragMoved = false
  dragTimer = setInterval(() => {
    if (!bubble || !dragOrigin) return
    const p = screen.getCursorScreenPoint()
    const dx = p.x - dragOrigin.cx
    const dy = p.y - dragOrigin.cy
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true
    if (dragMoved) bubble.setPosition(dragOrigin.wx + dx, dragOrigin.wy + dy)
  }, 16)
}

/** Returns true if the bubble actually moved (so the mouseup should not count as a click). */
export function endBubbleDrag(): boolean {
  if (dragTimer) clearInterval(dragTimer)
  dragTimer = null
  dragOrigin = null
  if (dragMoved && bubble) {
    const [x, y] = bubble.getPosition()
    saveBubblePosition({ x, y })
  }
  const moved = dragMoved
  dragMoved = false
  return moved
}

import { BrowserWindow, nativeImage, screen, shell, systemPreferences } from 'electron'
import type { OcrLine, PickupPicture, QuickState } from '../shared/types'
import { join } from 'path'
import { readText } from './ocr'
import { getStored, saveBubblePosition } from './settings'

const BUBBLE_SIZE = 84
const PANEL_W = 420
const PANEL_H = 580
const QUICK_W = 420
const QUICK_MAX_H = 560
const GAP = 14

let bubble: BrowserWindow | null = null
let panel: BrowserWindow | null = null
let quick: BrowserWindow | null = null

function load(win: BrowserWindow, view: 'bubble' | 'panel' | 'quick' | 'pickup'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(`${devUrl}?view=${view}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { query: { view } })
}

/** Tells a window when it's hidden, so it can stop animating for nobody. */
function sleepWhenHidden(win: BrowserWindow): void {
  const tell = () => win.webContents.send('window:visible', win.isVisible())
  win.on('show', tell)
  win.on('hide', tell)
  win.webContents.on('did-finish-load', tell)
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
  sleepWhenHidden(panel)
  panel.on('closed', () => (panel = null))
  return panel
}

export function createQuick(): BrowserWindow {
  quick = new BrowserWindow({
    width: QUICK_W,
    height: 140,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false, // the card draws its own soft shadow
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences
  })
  quick.setAlwaysOnTop(true, 'floating')
  quick.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  secure(quick)
  load(quick, 'quick')
  // A popover: clicking anywhere else puts it away (the chat keeps going in the panel),
  // unless it's pinned to collect more captures, or the blur was a switch to another desktop.
  quick.on('blur', () => {
    if (quickState.pinned) return
    quickBlurAt = Date.now()
    if (blurTimer) clearTimeout(blurTimer)
    blurTimer = setTimeout(() => {
      blurTimer = null
      if (quick && !quick.isFocused()) quick.hide()
    }, BLUR_HIDE_DELAY)
  })
  quick.on('focus', () => {
    if (blurTimer) clearTimeout(blurTimer)
    blurTimer = null
  })
  if (process.platform === 'darwin') {
    systemPreferences.subscribeWorkspaceNotification('NSWorkspaceActiveSpaceDidChangeNotification', followToSpace)
  }
  sleepWhenHidden(quick)
  quick.on('closed', () => (quick = null))
  return quick
}

// --- Pick up text: a picture with its words selectable. It floats until closed, so the user can paste elsewhere and come back.

const PICKUP_MIN_W = 360
const PICKUP_BAR_H = 48

let pickup: BrowserWindow | null = null
/** Only held while the window is open. */
let pickupImage: { picture: PickupPicture; bytes: Buffer; words?: Promise<OcrLine[] | null> } | null = null

export function showPickup(dataUrl: string): void {
  const image = /^data:image\//.test(dataUrl) ? nativeImage.createFromDataURL(dataUrl) : null
  if (!image || image.isEmpty()) return
  pickup?.close()

  // A snip's pixels are the screen's, so divide by its scale to show the words at their real size.
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const wa = display.workArea
  const { width, height } = image.getSize()
  const natural = { width: width / display.scaleFactor, height: height / display.scaleFactor }
  const fit = Math.min(1, (wa.width - GAP * 2) / natural.width, (wa.height - GAP * 2 - PICKUP_BAR_H) / natural.height)
  const picture = { dataUrl, width: Math.round(natural.width * fit), height: Math.round(natural.height * fit) }
  pickupImage = { picture, bytes: image.toPNG() }

  const w = Math.max(picture.width, PICKUP_MIN_W)
  const h = picture.height + PICKUP_BAR_H
  const win = new BrowserWindow({
    x: Math.round(Math.max(wa.x + GAP, Math.min(cursor.x - w / 2, wa.x + wa.width - w - GAP))),
    y: Math.round(Math.max(wa.y + GAP, Math.min(cursor.y - h / 2, wa.y + wa.height - h - GAP))),
    width: w,
    height: h,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences
  })
  pickup = win
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  secure(win)
  load(win, 'pickup')
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (pickup !== win) return
    pickup = null
    pickupImage = null
  })
}

export const getPickup = () => pickup

/** Every Otty window on screen right now. */
export function shownWindows(): BrowserWindow[] {
  return [bubble, panel, quick, pickup].filter((w): w is BrowserWindow => !!w?.isVisible())
}
export const pickupPicture = (): PickupPicture | null => pickupImage?.picture ?? null

export function readPickup(): Promise<OcrLine[] | null> {
  if (!pickupImage) return Promise.resolve(null)
  return (pickupImage.words ??= readText(pickupImage.bytes))
}

// --- Quick view across desktops and while collecting captures.

/** How long a blur waits before hiding, so a desktop switch can cancel it. */
const BLUR_HIDE_DELAY = 350
/** A desktop switch this soon after a blur means the blur was the switch. */
const SPACE_GRACE = 1200

let quickState: QuickState = { collecting: false, pinned: false }
let quickBlurAt = 0
let blurTimer: NodeJS.Timeout | null = null

export function setQuickState(s: QuickState): void {
  quickState = { collecting: !!s.collecting, pinned: !!s.collecting && !!s.pinned }
}

/** True when a hotkey should add to the quick view: it's open, collecting, and another app has focus. */
export function quickIsCollecting(): boolean {
  return !!quick?.isVisible() && !quick.isFocused() && quickState.collecting
}

/**
 * The user switched desktops. The quick view is on every desktop, so it only needs to not be hidden by the
 * blur that came with the switch. It doesn't take focus back: the next capture must copy from the other app.
 */
function followToSpace(): void {
  if (!quick || Date.now() - quickBlurAt > SPACE_GRACE) return
  if (blurTimer) {
    clearTimeout(blurTimer)
    blurTimer = null
  } else if (!quick.isVisible()) {
    quick.showInactive()
  }
}

export const getBubble = () => bubble
export const getPanel = () => panel
export const getQuick = () => quick

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

// --- Quick view: sized by its content, revealed once the renderer has laid out the new query.

let quickAnchor: { x: number; y: number } | null = null
let quickRevealTimer: NodeJS.Timeout | null = null

function revealQuick(): void {
  if (quickRevealTimer) clearTimeout(quickRevealTimer)
  quickRevealTimer = null
  quick?.show()
  quick?.focus()
}

/** Anchor the quick view just under the cursor. It appears on the renderer's first size report. */
export function prepareQuickAtCursor(): void {
  if (!quick) return
  const c = screen.getCursorScreenPoint()
  quickAnchor = { x: c.x - 28, y: c.y + 10 }
  if (quick.isVisible()) quick.hide()
  placeQuick(quick.getSize()[1]) // move now, so even the fallback reveal lands at the cursor
  quickRevealTimer = setTimeout(revealQuick, 400) // fallback if the renderer never reports
}

export function resizeQuick(height: number): void {
  placeQuick(height)
  if (quickRevealTimer) revealQuick()
}

function placeQuick(height: number): void {
  if (!quick || !quickAnchor) return
  const wa = screen.getDisplayNearestPoint(quickAnchor).workArea
  const h = Math.round(Math.max(60, Math.min(height, QUICK_MAX_H, wa.height - GAP * 2)))
  const x = Math.max(wa.x + GAP, Math.min(quickAnchor.x, wa.x + wa.width - QUICK_W - GAP))
  // Grow downward from the cursor; slide up only when we'd run off the bottom of the screen.
  const y = Math.max(wa.y + GAP, Math.min(quickAnchor.y, wa.y + wa.height - h - GAP))
  quick.setBounds({ x: Math.round(x), y: Math.round(y), width: QUICK_W, height: h })
}

/** Swap the quick view for the full panel at the same spot. */
export function expandQuickToPanel(): void {
  if (!quick || !panel) return
  const [x, y] = quick.getPosition()
  quick.hide()
  showPanelAt({ x: x - GAP, y: y - GAP })
}

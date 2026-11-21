import { app, BrowserWindow, Menu, screen, systemPreferences, type Rectangle } from 'electron'
import type { WindowGlide, WindowState } from '../shared/types'
import { getStored, saveWindowBounds } from './settings'

// The Otty window's two states (D-65, Spec 06): one window that floats beside your work, or a normal Mac window with
// traffic lights. Neither has a Dock icon or menu bar (2026-11-21): only a background-only app can float over full-screen
// apps, and switching in and out of it moved the focus to the app behind on every move. Expand and Shrink move between them in one animated move, and each
// state reopens where it was left. The renderer hears which state it's in, for the header's height, and draws the move
// (`window:glide`).

export const ROOMY = { width: 1280, height: 800, minWidth: 720, minHeight: 520 } as const
export const FLOATING = { width: 420, height: 580, minWidth: 360, minHeight: 420 } as const

/**
 * Every desktop, over full-screen apps too, without Electron's process switch: by default each call turns Otty into a
 * background-only app (true) or a normal one (false), which hides and shows the Dock icon and hands the focus to another
 * app. Otty is background-only from launch, so nothing needs switching.
 */
export const SPACES = { visibleOnFullScreen: true, skipTransformProcessType: true } as const

let state: WindowState = 'floating'
/** A glide is under way; `move` counts them, so a newer one (or closing) stops the last mid-step. */
let moving = false
let move = 0

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

/** What floats above everything, and what doesn't. */
function behave(win: BrowserWindow, to: WindowState): void {
  if (to === 'roomy') {
    win.setAlwaysOnTop(false)
    win.setVisibleOnAllWorkspaces(false, SPACES)
    win.setWindowButtonVisibility(true)
    win.setFullScreenable(true)
    win.setMaximizable(true)
    win.setMinimumSize(ROOMY.minWidth, ROOMY.minHeight)
  } else {
    win.setFullScreenable(false)
    // Double-clicking the header is macOS's zoom: on the floating window it would grow it in one native resize and
    // leave it above everything. Expand is the way to grow it.
    win.setMaximizable(false)
    win.setWindowButtonVisibility(false)
    win.setMinimumSize(FLOATING.minWidth, FLOATING.minHeight)
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, SPACES)
  }
}

const leaveFullScreen = (win: BrowserWindow) =>
  new Promise<void>((resolve) => {
    if (!win.isFullScreen()) return resolve()
    win.once('leave-full-screen', () => resolve())
    win.setFullScreen(false)
  })

/** The move's length (Spec 06, W1): `--t-travel`. The page draws it; main only waits it out. */
const TRAVEL_MS = 720
/**
 * The longest main waits for the page to say it has drawn a step, so a stuck page can't hold the window hidden. Generous:
 * the stand-in covers the wait, and revealing early showed whatever the page last drew (a dev build re-lays out slowly).
 */
const READY_MS = 700

/** Called when the page has drawn the latest `window:glide` at the window's size (`window:glide-ready`). */
let ready: (() => void) | null = null
export function glideReady(): void {
  ready?.()
}

/** Tells the page a step of the move, and waits until it has drawn it at that size (or READY_MS). */
function step(win: BrowserWindow, g: WindowGlide): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      if (ready === done) ready = null
      resolve()
    }
    const timer = setTimeout(done, READY_MS)
    ready = done
    win.webContents.send('window:glide', g)
  })
}

const union = (a: Rectangle, b: Rectangle): Rectangle => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}
const within = (r: Rectangle, u: Rectangle): Rectangle => ({ x: r.x - u.x, y: r.y - u.y, width: r.width, height: r.height })
const sameOrigin = (a: Rectangle, b: Rectangle) => a.x === b.x && a.y === b.y

/** The longest the move waits for its stand-in. */
const STAND_IN_MS = 250

/** Mirrors the floating panel's `--radius`, for the stand-in's corners. */
const FLOATING_RADIUS = 24

/** A window that only ever shows a picture of the panel. Between moves it's empty and tiny, but never hidden. */
let standIn: Promise<BrowserWindow> | null = null

/**
 * The stand-in waits as one empty pixel where it last was. It's never hidden (showing a window let macOS show its last
 * picture at its last place), and never moved while it could still hold a picture: macOS can show the old picture at
 * the new place for a frame, which flashed a second panel at the screen's corner. Shrinking it where it is crops
 * anything left to a pixel.
 */
const parked = (b: Rectangle): Rectangle => ({ x: b.x, y: b.y, width: 1, height: 1 })

/**
 * Makes the stand-in window ahead of the first move (making and loading it takes longer than a move can wait), and
 * returns it. Called when the panel first shows, and again if it was lost.
 */
export function prepareStandIn(): Promise<BrowserWindow> {
  if (standIn) return standIn
  const helper = new BrowserWindow({ show: false, frame: false, transparent: true, hasShadow: false, focusable: false, resizable: false, skipTaskbar: true, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  helper.setIgnoreMouseEvents(true)
  helper.setAlwaysOnTop(true, 'floating')
  helper.setVisibleOnAllWorkspaces(true, SPACES)
  helper.webContents.on('will-navigate', (e) => e.preventDefault())
  helper.on('closed', () => (standIn = null))
  const page = `data:text/html,<body style="margin:0;overflow:hidden;background:transparent"><img id="i" style="display:block;width:100vw;height:100vh;border-radius:${FLOATING_RADIUS}px;visibility:hidden">`
  standIn = helper.loadURL(page).then(() => {
    helper.setBounds(parked(helper.getBounds()))
    helper.showInactive()
    return helper
  })
  standIn.catch(() => (standIn = null))
  return standIn
}

/**
 * Shows a picture of the panel where it is on screen (`shown`), above it, within `ms`, and resolves once it's drawn
 * there; the returned function puts it away. It covers the few frames in which the panel itself is hidden. The window
 * moves while it's empty and only then draws the picture, so no frame of it can appear anywhere else, and a picture
 * that isn't ready in time is dropped (a late one once flashed a second panel at the screen's corner).
 */
async function standInFor(win: BrowserWindow, shown: Rectangle, ms: number): Promise<() => void> {
  let late = false
  const timer = setTimeout(() => (late = true), ms)
  try {
    const at = win.getBounds()
    const [pic, helper] = await Promise.all([
      win.webContents.capturePage({ x: shown.x - at.x, y: shown.y - at.y, width: shown.width, height: shown.height }),
      prepareStandIn()
    ])
    if (late || helper.isDestroyed()) throw new Error(`no picture in ${ms} ms`)
    const away = () => {
      if (helper.isDestroyed()) return
      void helper.webContents
        .executeJavaScript(`i.style.visibility = 'hidden'; new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 80) })`)
        .then(() => !helper.isDestroyed() && helper.setBounds(parked(helper.getBounds())), () => {})
    }
    helper.setBounds(shown)
    // Our own capture, as a data URL, decoded while still invisible; only then, if still in time, shown and given two
    // frames (or 80 ms) to be drawn before the move goes on.
    const src = `data:image/jpeg;base64,${pic.toJPEG(90).toString('base64')}`
    await helper.webContents.executeJavaScript(`i.src = ${JSON.stringify(src)}; i.decode()`)
    if (late || helper.isDestroyed()) {
      away()
      throw new Error(`no picture in ${ms} ms`)
    }
    await helper.webContents.executeJavaScript(
      `new Promise((r) => { i.style.visibility = 'visible'; requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 80) })`
    )
    return () => void setTimeout(away, 34)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Puts the window at `bounds` while the page draws `g`. A window that keeps its top-left corner keeps its last picture
 * where it was, so it just grows or is cropped. One whose corner moves would show that picture shifted for a frame or
 * two, so the page blanks itself before the jump, and a stand-in picture of the panel (`shown`, where it is on screen)
 * covers its place until the page has drawn at the new size, so nothing blinks.
 */
async function place(win: BrowserWindow, bounds: Rectangle, g: WindowGlide, shown: Rectangle, stopped: () => boolean): Promise<void> {
  const moves = !sameOrigin(win.getBounds(), bounds)
  // The move never waits past STAND_IN_MS: a picture still on its way is dropped when it gets there.
  const pending = moves ? standInFor(win, shown, STAND_IN_MS) : null
  const away = pending
    ? await Promise.race([pending, new Promise<never>((_, no) => setTimeout(() => no(new Error('no picture in time')), STAND_IN_MS + 20))]).catch((e: Error) => {
        console.warn('stand-in skipped:', e.message)
        void pending.then((late) => late(), () => {}) // if it does come up after all, it goes straight away
        return () => {}
      })
    : null
  // Closed or turned around while the picture was on its way: this move no longer owns the window.
  if (stopped()) return away?.()
  // Never hidden by opacity: a transparent window stops drawing (macOS counts it as unseen), and on showing again it
  // appeared for a frame at its old corner, at its new size (a second panel at the screen's corner). Instead the page
  // blanks itself first, while it can still draw, so the picture left behind by the jump is empty; the stand-in
  // covers the panel's place meanwhile.
  if (moves) {
    const now = win.getBounds()
    await step(win, { width: now.width, height: now.height, blank: true })
    if (stopped()) return away?.()
  }
  const drawn = step(win, g)
  win.setBounds(bounds)
  await drawn
  away?.()
}

/**
 * One move to `to` (Spec 06, W1). Resizing a window on every frame wobbles (its edges move before the page redraws),
 * so the window changes size twice instead: it jumps once to an invisible area covering both places, the page grows a
 * panel growing from the old place to the new one, and the window lands on `to`. Clicks pass through the
 * empty area (macOS does that for transparent pixels), and the shadow and traffic lights wait for the landing. Reduced motion jumps. Returns false if stopped.
 */
async function glide(win: BrowserWindow, to: Rectangle): Promise<boolean> {
  const id = ++move
  const from = win.getBounds()
  if (systemPreferences.getAnimationSettings().prefersReducedMotion) {
    win.setBounds(to)
    await step(win, { width: to.width, height: to.height })
    return true
  }
  moving = true
  const all = union(from, to)
  // No setIgnoreMouseEvents: macOS already lets clicks through a transparent window's empty pixels, and toggling it
  // left the floating panel click-through after a Shrink (2026-11-21).
  win.setHasShadow(false)
  win.setWindowButtonVisibility(false)
  const stopped = () => id !== move || win.isDestroyed()
  try {
    await place(win, all, { width: all.width, height: all.height, from: within(from, all), to: within(to, all) }, from, stopped)
    if (stopped()) return false
    await new Promise((r) => setTimeout(r, TRAVEL_MS))
    if (stopped()) return false
    await place(win, to, { width: to.width, height: to.height }, to, stopped)
    return !stopped()
  } finally {
    if (!win.isDestroyed()) {
      win.setHasShadow(true)
    }
    if (id === move) moving = false
  }
}

/** Stops a glide where it is. */
function stopGlide(): void {
  move++
  moving = false
}

/** Moves run one after another: Expand pressed mid-Shrink waits for the Shrink to land, then decides. */
let queue: Promise<unknown> = Promise.resolve()
const inTurn = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}

/** Floating → roomy: a normal window with traffic lights, then one move to the roomy bounds (Spec 06, Expand). */
export const expand = (win: BrowserWindow): Promise<void> =>
  inTurn(async () => {
    if (state === 'roomy' || win.isDestroyed()) return
    saveWindowBounds('floating', win.getBounds())
    state = 'roomy'
    tell(win)
    // Focus first, and only then leave the floating level, so Otty is never a normal window behind another app.
    if (!win.isVisible()) win.show()
    app.focus({ steal: true })
    win.focus()
    behave(win, 'roomy')
    if (await glide(win, roomyBounds())) win.setWindowButtonVisibility(true)
  })

/**
 * Roomy → floating: out of full screen, one move back, and only then floating above everything again. `at` places the floating window, beside the bubble or the cursor.
 */
export const shrink = (win: BrowserWindow, at: (size: { width: number; height: number }) => { x: number; y: number }): Promise<void> =>
  inTurn(async () => {
    if (state === 'floating' || win.isDestroyed()) return
    await leaveFullScreen(win)
    saveWindowBounds('roomy', win.getBounds())
    state = 'floating'
    tell(win)
    const size = floatingSize()
    win.setMinimumSize(FLOATING.minWidth, FLOATING.minHeight)
    if (!(await glide(win, { ...at(size), ...size }))) return
    behave(win, 'floating')
    win.focus()
  })

/** Closing the roomy window hides it and puts it back to floating for next time. */
export function closeRoomy(win: BrowserWindow): void {
  // Mid-move the window covers both places: keep the roomy bounds it last landed on.
  if (!moving) saveWindowBounds('roomy', win.getBounds())
  stopGlide()
  win.hide()
  state = 'floating'
  behave(win, 'floating')
  const size = floatingSize()
  win.setSize(size.width, size.height)
  tell(win)
  win.webContents.send('window:glide', size satisfies WindowGlide)
}

/** A move or resize ended: remember the place for this state. */
export function remember(win: BrowserWindow): void {
  if (!moving && !win.isFullScreen()) saveWindowBounds(state, win.getBounds())
}

/** The app menu (Spec 06): built once, and again when Pause changes. */
export function setAppMenu(template: Electron.MenuItemConstructorOptions[]): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** For the state on a new load of the window. */
export const sendState = tell

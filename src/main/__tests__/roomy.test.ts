// D-65: the Otty window's two states. Neither touches the Dock or switches the app's kind (that moved the focus);
// restored bounds off every display fall back to defaults; the level, traffic lights and minimum size follow the state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
const stored: { windowBounds?: Record<string, { x: number; y: number; width: number; height: number }> } = {}
const display = { workArea: { x: 0, y: 25, width: 1440, height: 875 } }

vi.mock('electron', () => ({
  app: {
    dock: { show: () => void calls.push('dock:show'), hide: () => void calls.push('dock:hide') },
    setActivationPolicy: () => void calls.push('dock:policy'),
    focus: () => void calls.push('focus')
  },
  Menu: { setApplicationMenu: () => {}, buildFromTemplate: (t: unknown) => t },
  systemPreferences: { getAnimationSettings: () => ({ prefersReducedMotion: false }) },
  screen: { getAllDisplays: () => [display], getDisplayNearestPoint: () => display, getCursorScreenPoint: () => ({ x: 10, y: 10 }) }
}))
vi.mock('../settings', () => ({
  getStored: () => stored,
  saveWindowBounds: (state: string, b: { x: number; y: number; width: number; height: number }) => void (stored.windowBounds = { ...stored.windowBounds, [state]: b })
}))

const { closeRoomy, expand, fits, roomyBounds, shrink, windowState } = await import('../roomy')

function fakeWindow() {
  let bounds = { x: 900, y: 300, width: 420, height: 580 }
  let full = false
  const listeners = new Map<string, () => void>()
  const win = {
    getBounds: () => bounds,
    setBounds: (b: typeof bounds) => {
      calls.push(`bounds:${b.width}x${b.height}`)
      bounds = b
    },
    setSize: (w: number, h: number) => (bounds = { ...bounds, width: w, height: h }),
    setAlwaysOnTop: (on: boolean) => void calls.push(`top:${on}`),
    // Without skipTransformProcessType, Electron switches Otty in and out of a background-only app, moving the focus.
    setVisibleOnAllWorkspaces: (on: boolean, o?: { skipTransformProcessType?: boolean }) =>
      void calls.push(`spaces:${on}${o?.skipTransformProcessType ? '' : ':switches-app'}`),
    setWindowButtonVisibility: (on: boolean) => void calls.push(`lights:${on}`),
    setWindowButtonPosition: () => {},
    setFullScreenable: (on: boolean) => void calls.push(`fullscreenable:${on}`),
    setMaximizable: (on: boolean) => void calls.push(`zoom:${on}`),
    setMinimumSize: (w: number, h: number) => void calls.push(`min:${w}x${h}`),
    setOpacity: (o: number) => void calls.push(`opacity:${o}`),
    setIgnoreMouseEvents: (on: boolean) => void calls.push(`clickThrough:${on}`),
    setHasShadow: (on: boolean) => void calls.push(`shadow:${on}`),
    isVisible: () => true,
    isDestroyed: () => false,
    show: () => {},
    hide: () => void calls.push('hide'),
    focus: () => {},
    isFullScreen: () => full,
    setFullScreen: (on: boolean) => {
      full = on
      calls.push(`fullscreen:${on}`)
      if (!on) queueMicrotask(() => listeners.get('leave-full-screen')?.())
    },
    once: (e: string, f: () => void) => void listeners.set(e, f),
    webContents: { send: (channel: string, v: unknown) => void calls.push(`${channel}:${typeof v === 'string' ? v : JSON.stringify(v)}`) }
  }
  return { win: win as never, enterFull: () => (full = true) }
}

const spot = () => ({ x: 900, y: 300 })

/** Runs a move to its end: main steps the window on a timer. */
async function settled(move: Promise<void>) {
  await vi.runAllTimersAsync()
  await move
}

beforeEach(() => {
  vi.useFakeTimers()
  calls.length = 0
  delete stored.windowBounds
})
afterEach(() => vi.useRealTimers())

describe('the two states (Spec 06)', () => {
  it('expand: focus, then a normal window with traffic lights, then one move to 1280 × 800', async () => {
    const { win } = fakeWindow()
    await settled(expand(win))
    expect(windowState()).toBe('roomy')
    // Focus first, then off the floating level; the Dock is left alone, since changing it moves the focus.
    expect(calls.indexOf('focus')).toBeLessThan(calls.indexOf('top:false'))
    expect(calls.filter((c) => c.startsWith('dock:'))).toEqual([])
    expect(calls).toEqual(expect.arrayContaining(['top:false', 'spaces:false', 'lights:true', 'fullscreenable:true', 'zoom:true', 'min:720x520', 'window:state:roomy']))
    expect(stored.windowBounds?.floating).toEqual({ x: 900, y: 300, width: 420, height: 580 })
  })

  it('shrink: out of full screen, back to its floating size, and above everything once it lands', async () => {
    const { win, enterFull } = fakeWindow()
    enterFull()
    calls.length = 0
    await settled(shrink(win, spot))
    expect(windowState()).toBe('floating')
    expect(calls[0]).toBe('fullscreen:false')
    expect(calls.filter((c) => c.startsWith('dock:'))).toEqual([])
    // Back above everything only once it has landed.
    expect(calls.indexOf('bounds:420x580')).toBeLessThan(calls.lastIndexOf('top:true'))
    expect(calls).toEqual(expect.arrayContaining(['top:true', 'spaces:true', 'lights:false', 'fullscreenable:false', 'zoom:false', 'min:360x420', 'window:state:floating']))
    expect(stored.windowBounds?.roomy).toBeDefined()
  })

  it('moves in two jumps: to one window covering both places, where the page draws the glide, then onto the roomy bounds', async () => {
    const { win } = fakeWindow()
    closeRoomy(win) // the state lives in the module: start from floating
    calls.length = 0
    delete stored.windowBounds
    await settled(expand(win))
    // Floating at 900,300 420×580 and roomy at 80,63 1280×800: the union is 80,63 1280×817.
    expect(calls.filter((c) => c.startsWith('bounds:'))).toEqual(['bounds:1280x817', 'bounds:1280x800'])
    const glides = calls.filter((c) => c.startsWith('window:glide:')).map((c) => JSON.parse(c.slice('window:glide:'.length)))
    // The corner moves, so the page blanks itself first (at the size it is), then the window jumps.
    expect(glides[0]).toEqual({ width: 420, height: 580, blank: true })
    expect(glides[1]).toEqual({ width: 1280, height: 817, from: { x: 820, y: 237, width: 420, height: 580 }, to: { x: 0, y: 0, width: 1280, height: 800 } })
    expect(calls.indexOf('window:glide:' + JSON.stringify(glides[0]))).toBeLessThan(calls.indexOf('bounds:1280x817'))
    // Never hidden by opacity: a transparent window stops drawing, and reappeared for a frame at its old corner.
    expect(calls.filter((c) => c.startsWith('opacity'))).toEqual([])
    expect(calls).toEqual(expect.arrayContaining(['shadow:false', 'shadow:true']))
    expect(calls).toEqual(expect.arrayContaining(['shadow:false', 'shadow:true']))
    // Never toggled: it left the floating panel click-through after a Shrink.
    expect(calls.filter((c) => c.startsWith('clickThrough'))).toEqual([])
    expect(calls.at(-1)).toBe('lights:true')
  })

  it('shrinking mid-expand waits for the landing, then goes back, and the floating bounds stay where they were', async () => {
    const { win } = fakeWindow()
    closeRoomy(win) // the state lives in the module: start from floating
    calls.length = 0
    const out = expand(win)
    await vi.advanceTimersByTimeAsync(200)
    const back = shrink(win, spot)
    await settled(Promise.all([out, back]).then(() => {}))
    expect(windowState()).toBe('floating')
    expect(calls.filter((c) => c.startsWith('bounds:')).at(-1)).toBe('bounds:420x580')
    expect(calls.filter((c) => c.startsWith('dock:'))).toEqual([])
    expect(stored.windowBounds?.floating).toEqual({ x: 900, y: 300, width: 420, height: 580 })
  })

  it('reopens each state where it was left, unless that’s off every display', () => {
    stored.windowBounds = { roomy: { x: 100, y: 100, width: 1000, height: 700 } }
    expect(roomyBounds()).toEqual({ x: 100, y: 100, width: 1000, height: 700 })
    stored.windowBounds = { roomy: { x: 3000, y: 100, width: 1000, height: 700 } }
    expect(fits(stored.windowBounds.roomy)).toBe(false)
    expect(roomyBounds()).toEqual({ x: 80, y: 63, width: 1280, height: 800 })
  })

  it('closing the roomy window hides it and leaves it floating for next time', async () => {
    const { win } = fakeWindow()
    await settled(expand(win))
    calls.length = 0
    closeRoomy(win)
    expect(calls[0]).toBe('hide')
    expect(windowState()).toBe('floating')
    expect(calls.filter((c) => c.startsWith('dock:'))).toEqual([])
  })
})

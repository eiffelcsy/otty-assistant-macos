// D-65: the Otty window's two states. Expand shows the Dock before the move and Shrink hides it after; restored bounds
// off every display fall back to defaults; the level, traffic lights and minimum size follow the state.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
const stored: { windowBounds?: Record<string, { x: number; y: number; width: number; height: number }> } = {}
const display = { workArea: { x: 0, y: 25, width: 1440, height: 875 } }

vi.mock('electron', () => ({
  app: { dock: { show: () => void calls.push('dock:show'), hide: () => void calls.push('dock:hide') } },
  Menu: { setApplicationMenu: () => {}, buildFromTemplate: (t: unknown) => t },
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
    setVisibleOnAllWorkspaces: (on: boolean) => void calls.push(`spaces:${on}`),
    setWindowButtonVisibility: (on: boolean) => void calls.push(`lights:${on}`),
    setFullScreenable: (on: boolean) => void calls.push(`fullscreenable:${on}`),
    setMinimumSize: (w: number, h: number) => void calls.push(`min:${w}x${h}`),
    isVisible: () => true,
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
    webContents: { send: (channel: string, v: string) => void calls.push(`${channel}:${v}`) }
  }
  return { win: win as never, enterFull: () => (full = true) }
}

const spot = () => ({ x: 900, y: 300 })

beforeEach(() => {
  calls.length = 0
  delete stored.windowBounds
})

describe('the two states (Spec 06)', () => {
  it('expand: the Dock first, a normal window with traffic lights, then one move to 1280 × 800', () => {
    const { win } = fakeWindow()
    expand(win)
    expect(windowState()).toBe('roomy')
    expect(calls.indexOf('dock:show')).toBeLessThan(calls.indexOf('bounds:1280x800'))
    expect(calls).toEqual(expect.arrayContaining(['top:false', 'spaces:false', 'lights:true', 'fullscreenable:true', 'min:720x520', 'window:state:roomy']))
    expect(stored.windowBounds?.floating).toEqual({ x: 900, y: 300, width: 420, height: 580 })
  })

  it('shrink: out of full screen, back to its floating size, and the Dock leaves last', async () => {
    const { win, enterFull } = fakeWindow()
    enterFull()
    calls.length = 0
    await shrink(win, spot)
    expect(windowState()).toBe('floating')
    expect(calls[0]).toBe('fullscreen:false')
    expect(calls.at(-1)).toBe('dock:hide')
    expect(calls.indexOf('bounds:420x580')).toBeLessThan(calls.indexOf('dock:hide'))
    expect(calls).toEqual(expect.arrayContaining(['top:true', 'spaces:true', 'lights:false', 'fullscreenable:false', 'min:360x420', 'window:state:floating']))
    expect(stored.windowBounds?.roomy).toBeDefined()
  })

  it('reopens each state where it was left, unless that’s off every display', () => {
    stored.windowBounds = { roomy: { x: 100, y: 100, width: 1000, height: 700 } }
    expect(roomyBounds()).toEqual({ x: 100, y: 100, width: 1000, height: 700 })
    stored.windowBounds = { roomy: { x: 3000, y: 100, width: 1000, height: 700 } }
    expect(fits(stored.windowBounds.roomy)).toBe(false)
    expect(roomyBounds()).toEqual({ x: 80, y: 63, width: 1280, height: 800 })
  })

  it('closing the roomy window hides it and leaves it floating for next time', () => {
    const { win } = fakeWindow()
    expand(win)
    calls.length = 0
    closeRoomy(win)
    expect(calls[0]).toBe('hide')
    expect(windowState()).toBe('floating')
    expect(calls.at(-1)).toBe('dock:hide')
  })
})

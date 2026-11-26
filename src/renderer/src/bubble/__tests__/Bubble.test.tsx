// @vitest-environment jsdom
// D-37: files dropped on the otter go to main as ids, which opens a new chat with them.
// D-82 (Spec 13): the bubble is the pool; each state shows its marker and frame.
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { Bubble, SLEEP_MS } from '../Bubble'

const otty = {
  onBubbleState: () => () => {},
  onBubbleBadge: () => () => {},
  onBubbleMood: () => () => {},
  dropFiles: vi.fn(async (files: File[]) => files.map((f, i) => ({ id: `id${i}`, name: f.name }))),
  feedOtty: vi.fn(async () => {}),
  feedOttyText: vi.fn(async () => {}),
  bubbleDrag: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window, { otty })
})
afterEach(cleanup)

const drag = (files: File[], text = '') => ({
  dataTransfer: { types: files.length ? ['Files'] : text ? ['text/plain'] : [], files, dropEffect: '', getData: () => text }
})
const pool = (c: HTMLElement) => c.querySelector<HTMLElement>('.pool')!
/** The pool's state class: pool--<state>. */
const stateOf = (c: HTMLElement) => [...pool(c).classList].find((n) => n.startsWith('pool--') && n !== 'pool--bob')
const frameOf = (c: HTMLElement) => c.querySelector<HTMLImageElement>('.pool__frame')!.getAttribute('src')

describe('the pool (D-82, Spec 13)', () => {
  it('is a labelled button, and its aria-label is its tooltip', () => {
    const { container } = render(<Bubble />)
    const root = pool(container)
    expect(root.getAttribute('role')).toBe('button')
    expect(root.getAttribute('aria-label')).toBe('Click to ask Otty · Right-click for more')
    expect(root.getAttribute('title')).toBe(root.getAttribute('aria-label'))
  })

  it('shows the working wake and the two-frame loop while working', () => {
    let mood: (m: string) => void = () => {}
    Object.assign(window.otty, { onBubbleMood: (cb: (m: string) => void) => ((mood = cb), () => {}) })
    const { container } = render(<Bubble />)
    act(() => mood('working'))
    expect(stateOf(container)).toBe('pool--working')
    expect(container.querySelector('.bubble__working:not(.bubble__working--waiting)')).not.toBeNull()
    expect(container.querySelectorAll('.in-water__above .pool__frame').length).toBe(2)
    expect(pool(container).getAttribute('title')).toMatch(/looking into something/)
  })

  it('shows the straw ring and the pebble frame when it needs you', () => {
    let mood: (m: string) => void = () => {}
    Object.assign(window.otty, { onBubbleMood: (cb: (m: string) => void) => ((mood = cb), () => {}) })
    const { container } = render(<Bubble />)
    act(() => mood('waiting'))
    expect(stateOf(container)).toBe('pool--waiting')
    expect(container.querySelector('.bubble__working.bubble__working--waiting')).not.toBeNull()
    expect(frameOf(container)).toContain('float-pebble')
  })

  it('shows the paused bead and greys the water while paused', () => {
    let mood: (m: string) => void = () => {}
    Object.assign(window.otty, { onBubbleMood: (cb: (m: string) => void) => ((mood = cb), () => {}) })
    const { container } = render(<Bubble />)
    act(() => mood('paused'))
    expect(stateOf(container)).toBe('pool--paused')
    expect(container.querySelector('.bubble__paused')).not.toBeNull()
    expect(container.querySelector('.bubble__working')).toBeNull()
  })

  it('shows the sea glass beside an answer, alongside the working state', () => {
    let badge: (on: boolean) => void = () => {}
    let mood: (m: string) => void = () => {}
    Object.assign(window.otty, {
      onBubbleBadge: (cb: (on: boolean) => void) => ((badge = cb), () => {}),
      onBubbleMood: (cb: (m: string) => void) => ((mood = cb), () => {}) })
    const { container } = render(<Bubble />)
    act(() => badge(true))
    expect(container.querySelector('.bubble__badge')).not.toBeNull()
    expect(pool(container).getAttribute('title')).toBe('Otty has an answer for you · Click to see it')
    act(() => mood('working'))
    expect(stateOf(container)).toBe('pool--working')
    expect(container.querySelector('.bubble__badge')).not.toBeNull()
  })

  it('keeps the order: a feed over a working pool shows the working state', () => {
    let mood: (m: string) => void = () => {}
    Object.assign(window.otty, { onBubbleMood: (cb: (m: string) => void) => ((mood = cb), () => {}) })
    const { container } = render(<Bubble />)
    act(() => mood('working'))
    fireEvent.dragOver(pool(container), drag([], 'a line'))
    expect(stateOf(container)).toBe('pool--working')
  })

  it('arms one hour timer, moves the water at the next painting, and clears it on unmount', () => {
    vi.useFakeTimers({ now: new Date(2026, 0, 1, 7, 59, 0) })
    try {
      const { container, unmount } = render(<Bubble />)
      expect(pool(container).getAttribute('data-time')).toBe('dawn')
      act(() => void vi.advanceTimersByTime(60_000))
      expect(pool(container).getAttribute('data-time')).toBe('day')
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('feeding Otty (D-37)', () => {
  it('swells while files are over it, and hands them to main by id on drop', async () => {
    const { container } = render(<Bubble />)
    const root = pool(container)
    const pdf = new File(['x'], 'report.pdf')
    fireEvent.dragOver(root, drag([pdf]))
    expect(root.classList.contains('pool--feeding')).toBe(true)
    fireEvent.drop(root, drag([pdf]))
    expect(root.classList.contains('pool--feeding')).toBe(false)
    await waitFor(() => expect(otty.feedOtty).toHaveBeenCalledWith(['id0']))
    expect(otty.dropFiles).toHaveBeenCalledWith([pdf])
  })

  it('rings once on a text drop, and hands the text to main', () => {
    const { container } = render(<Bubble />)
    const root = pool(container)
    fireEvent.dragOver(root, drag([], 'a line'))
    fireEvent.drop(root, drag([], '  a line  '))
    expect(container.querySelectorAll('.pool__ring').length).toBe(1)
    expect(otty.feedOttyText).toHaveBeenCalledWith('a line')
    expect(otty.dropFiles).not.toHaveBeenCalled()
  })

  it('ignores a drag with neither files nor text, and a drop main turned away', async () => {
    const { container } = render(<Bubble />)
    const root = pool(container)
    fireEvent.dragOver(root, drag([]))
    expect(root.classList.contains('pool--feeding')).toBe(false)
    otty.dropFiles.mockResolvedValueOnce([])
    fireEvent.drop(root, drag([new File(['x'], 'a.txt')]))
    await waitFor(() => expect(otty.dropFiles).toHaveBeenCalled())
    expect(otty.feedOtty).not.toHaveBeenCalled()
  })
})

describe('moods and sleep (D-38)', () => {
  afterEach(() => vi.useRealTimers())

  it('dozes off after a quiet spell, and a hover wakes it', () => {
    vi.useFakeTimers()
    const { container } = render(<Bubble />)
    expect(stateOf(container)).toBe('pool--resting')
    act(() => void vi.advanceTimersByTime(SLEEP_MS))
    expect(stateOf(container)).toBe('pool--asleep')
    expect(container.querySelectorAll('.pool__zs span').length).toBe(3)
    expect(frameOf(container)).toContain('float-doze')
    fireEvent.pointerEnter(pool(container))
    expect(stateOf(container)).toBe('pool--resting')
  })

  it('is carried once a press moves, and rings once let go', () => {
    const { container } = render(<Bubble />)
    const root = pool(container)
    root.setPointerCapture = () => {}
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, screenX: 100, screenY: 100 })
    expect(stateOf(container)).toBe('pool--resting')
    fireEvent.pointerMove(root, { pointerId: 1, screenX: 120, screenY: 100 })
    expect(stateOf(container)).toBe('pool--carried')
    fireEvent.pointerUp(root, { button: 0, pointerId: 1 })
    expect(stateOf(container)).toBe('pool--resting')
    expect(container.querySelectorAll('.pool__ring').length).toBe(1)
  })

  it('stays itself through a plain click: no carry, no ring', () => {
    const { container } = render(<Bubble />)
    const root = pool(container)
    root.setPointerCapture = () => {}
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, screenX: 100, screenY: 100 })
    fireEvent.pointerMove(root, { pointerId: 1, screenX: 102, screenY: 101 })
    fireEvent.pointerUp(root, { button: 0, pointerId: 1 })
    expect(stateOf(container)).toBe('pool--resting')
    expect(container.querySelector('.pool__ring')).toBeNull()
  })

  it('bobs and rings once per hover', () => {
    const { container } = render(<Bubble />)
    fireEvent.pointerEnter(pool(container))
    expect(pool(container).classList.contains('pool--bob')).toBe(true)
    expect(container.querySelector('.pool__ring')).not.toBeNull()
  })
})

describe('the water (D-83)', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.removeAttribute('data-asleep')
  })

  it('dips once after a quiet spell, and arms the next dip only after it', () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { container } = render(<Bubble />)
    const dips = () => pool(container).classList.contains('pool--dip')
    act(() => void vi.advanceTimersByTime(39_999))
    expect(dips()).toBe(false)
    act(() => void vi.advanceTimersByTime(1))
    expect(dips()).toBe(true)
    expect(container.querySelectorAll('.pool__ring').length).toBe(1)
    act(() => void vi.advanceTimersByTime(1600))
    expect(dips()).toBe(false)
    // Re-armed after the dip: the next one is 40 s later (random at 0), not before.
    act(() => void vi.advanceTimersByTime(39_999))
    expect(dips()).toBe(false)
    act(() => void vi.advanceTimersByTime(1))
    expect(dips()).toBe(true)
  })

  it('does not dip while asleep, paused or asleep-flagged, and cleans up on unmount', () => {
    vi.useFakeTimers()
    let mood: (m: string) => void = () => {}
    Object.assign(window.otty, { onBubbleMood: (cb: (m: string) => void) => ((mood = cb), () => {}) })
    const { container, unmount } = render(<Bubble />)
    act(() => mood('paused'))
    act(() => void vi.advanceTimersByTime(70_000))
    expect(pool(container).classList.contains('pool--dip')).toBe(false)
    document.documentElement.dataset.asleep = '1'
    act(() => void vi.advanceTimersByTime(70_000))
    expect(pool(container).classList.contains('pool--dip')).toBe(false)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ripples on a hover, and the hover does not play twice', () => {
    const { container } = render(<Bubble />)
    fireEvent.pointerEnter(pool(container))
    fireEvent.pointerEnter(pool(container))
    expect(container.querySelectorAll('.pool__ring').length).toBe(1)
  })
})

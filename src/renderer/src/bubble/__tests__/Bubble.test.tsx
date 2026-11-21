// @vitest-environment jsdom
// D-37: files dropped on the otter go to main as ids, which opens a new chat with them.
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
const face = (c: HTMLElement) => [...c.querySelector('.otter')!.classList].find((n) => n.startsWith('otter--'))

describe('feeding Otty (D-37)', () => {
  it('swells while files are over it, and hands them to main by id on drop', async () => {
    const { container } = render(<Bubble />)
    const bubble = container.querySelector('.bubble')!
    const pdf = new File(['x'], 'report.pdf')
    fireEvent.dragOver(bubble, drag([pdf]))
    expect(bubble.classList.contains('bubble--feeding')).toBe(true)
    fireEvent.drop(bubble, drag([pdf]))
    expect(bubble.classList.contains('bubble--feeding')).toBe(false)
    await waitFor(() => expect(otty.feedOtty).toHaveBeenCalledWith(['id0']))
    expect(otty.dropFiles).toHaveBeenCalledWith([pdf])
  })

  it('opens its mouth while something is over it, and munches on the drop', () => {
    const { container } = render(<Bubble />)
    const bubble = container.querySelector('.bubble')!
    fireEvent.dragOver(bubble, drag([], 'a line'))
    expect(face(container)).toBe('otter--hungry')
    fireEvent.drop(bubble, drag([], '  a line  '))
    expect(face(container)).toBe('otter--munch')
    expect(otty.feedOttyText).toHaveBeenCalledWith('a line')
    expect(otty.dropFiles).not.toHaveBeenCalled()
  })

  it('ignores a drag with neither files nor text, and a drop main turned away', async () => {
    const { container } = render(<Bubble />)
    const bubble = container.querySelector('.bubble')!
    fireEvent.dragOver(bubble, drag([]))
    expect(bubble.classList.contains('bubble--feeding')).toBe(false)
    otty.dropFiles.mockResolvedValueOnce([])
    fireEvent.drop(bubble, drag([new File(['x'], 'a.txt')]))
    await waitFor(() => expect(otty.dropFiles).toHaveBeenCalled())
    expect(otty.feedOtty).not.toHaveBeenCalled()
  })
})

describe('otter moods (D-38)', () => {
  afterEach(() => vi.useRealTimers())

  it('dozes off after a quiet spell, and a hover wakes it', () => {
    vi.useFakeTimers()
    const { container } = render(<Bubble />)
    expect(face(container)).toBe('otter--idle')
    act(() => void vi.advanceTimersByTime(SLEEP_MS))
    expect(face(container)).toBe('otter--sleepy')
    fireEvent.pointerEnter(container.querySelector('.bubble')!)
    expect(face(container)).toBe('otter--idle')
  })

  it('is caught once a press moves, and wiggles once let go', () => {
    const { container } = render(<Bubble />)
    const bubble = container.querySelector('.bubble')!
    bubble.setPointerCapture = () => {}
    fireEvent.pointerDown(bubble, { button: 0, pointerId: 1, screenX: 100, screenY: 100 })
    expect(face(container)).toBe('otter--idle')
    fireEvent.pointerMove(bubble, { pointerId: 1, screenX: 120, screenY: 100 })
    expect(face(container)).toBe('otter--caught')
    fireEvent.pointerUp(bubble, { button: 0, pointerId: 1 })
    expect(face(container)).toBe('otter--idle')
    expect(bubble.classList.contains('bubble--landed')).toBe(true)
  })

  it('stays itself through a plain click: no catch, no wiggle', () => {
    const { container } = render(<Bubble />)
    const bubble = container.querySelector('.bubble')!
    bubble.setPointerCapture = () => {}
    fireEvent.pointerDown(bubble, { button: 0, pointerId: 1, screenX: 100, screenY: 100 })
    fireEvent.pointerMove(bubble, { pointerId: 1, screenX: 102, screenY: 101 })
    fireEvent.pointerUp(bubble, { button: 0, pointerId: 1 })
    expect(face(container)).toBe('otter--idle')
    expect(bubble.classList.contains('bubble--landed')).toBe(false)
  })

  it('shows main’s face over its own: a head tilt when an answer fails', () => {
    let tell: (s: string) => void = () => {}
    Object.assign(window.otty, { onBubbleState: (cb: (s: string) => void) => ((tell = cb), () => {}) })
    const { container } = render(<Bubble />)
    act(() => tell('oops'))
    expect(face(container)).toBe('otter--oops')
  })
})

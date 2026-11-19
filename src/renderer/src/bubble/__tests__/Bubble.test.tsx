// @vitest-environment jsdom
// D-37: files dropped on the otter go to main as ids, which opens a new chat with them.
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bubble } from '../Bubble'

const otty = {
  onBubbleState: () => () => {},
  onBubbleBadge: () => () => {},
  onBubbleMood: () => () => {},
  dropFiles: vi.fn(async (files: File[]) => files.map((f, i) => ({ id: `id${i}`, name: f.name }))),
  feedOtty: vi.fn(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window, { otty })
})
afterEach(cleanup)

const drag = (files: File[]) => ({ dataTransfer: { types: files.length ? ['Files'] : ['text/plain'], files, dropEffect: '' } })

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

  it('ignores dragged text, and a drop main turned away', async () => {
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

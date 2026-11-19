// @vitest-environment jsdom
// D-68: a long highlight in a sent message folds to six lines, with Show all; find in chat unfolds it.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Capture } from '../../../../shared/types'
import { CaptureList } from '../Messages'

const capture = (text: string): Capture => ({ id: 'c1', context: { kind: 'text', text }, app: null })

/** jsdom has no layout: say how tall the text is against its six-line box. */
function tall(scroll: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scroll)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('a highlight in a sent message (D-68)', () => {
  it('folds a long one, with Show all and Show less, keeping every word', () => {
    tall(400)
    const text = 'word '.repeat(300)
    render(<CaptureList captures={[capture(text)]} />)
    const body = document.querySelector('.context-text__body')!
    expect(body.textContent).toBe(text)
    expect(body.classList.contains('context-text__body--open')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(body.classList.contains('context-text__body--open')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(body.classList.contains('context-text__body--open')).toBe(false)
  })

  it('gives a short one no button', () => {
    tall(100)
    render(<CaptureList captures={[capture('A short line.')]} />)
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull()
  })

  it('opens when find in chat unfolds it', () => {
    tall(400)
    render(<CaptureList captures={[capture('word '.repeat(300))]} />)
    act(() => void document.querySelector('.context-text__body')!.dispatchEvent(new Event('otty-unfold')))
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy()
  })

  it('stays cut short, with no button, in the tray', () => {
    tall(400)
    render(<CaptureList captures={[capture('word '.repeat(300))]} onRemove={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull()
    expect(document.querySelector('.context-text__body')!.textContent?.endsWith('…')).toBe(true)
  })
})

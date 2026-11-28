// @vitest-environment jsdom
// Pick up text: each copy shows "Copied" for its full 1.5 s, even right after another copy.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OcrLine, PickupPicture } from '../../../../shared/types'
import { Pickup } from '../Pickup'

const otty = {
  pickupPicture: vi.fn(async (): Promise<PickupPicture> => ({ dataUrl: 'data:image/png;base64,', width: 100, height: 40 })),
  pickupRead: vi.fn(async (): Promise<OcrLine[]> => [{ text: 'Otters hold hands', box: { x: 0, y: 0, w: 1, h: 0.5 } }]),
  copyText: vi.fn(async () => {}),
  closePickup: vi.fn(async () => {})
}
beforeEach(() => {
  ;(window as unknown as { otty: typeof otty }).otty = otty
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('a second copy keeps "Copied" for its own 1.5 s, not what was left of the first', async () => {
  render(<Pickup />)
  const button = await screen.findByRole('button', { name: 'Copy all' })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fireEvent.click(button)
  act(() => void vi.advanceTimersByTime(1000))
  fireEvent.click(button)
  act(() => void vi.advanceTimersByTime(1000)) // the first copy's 1.5 s are over by now
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
  act(() => void vi.advanceTimersByTime(600))
  expect(screen.getByRole('button', { name: 'Copy all' })).toBeTruthy()
})

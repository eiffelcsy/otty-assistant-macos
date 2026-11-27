// @vitest-environment jsdom
// Pebbles, step 1: a finished drawing can be kept, and main is asked by the answer's id and the drawing's place.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DrawingCard } from '../DrawingCard'

vi.mock('../render', () => ({ draw: async () => ({ kind: 'picture', dataUrl: 'data:image/svg+xml,x', width: 1, height: 1 }), theme: () => ({ bg: '#fff' }) }))
const otty = { keptPebbles: vi.fn(async () => [] as number[]), keepPebble: vi.fn(async () => true) }
Object.assign(window, { otty })
afterEach(cleanup)

describe('Keep on a drawing card', () => {
  it('keeps through main, then puts back', async () => {
    render(<DrawingCard kind="mermaid" code="pie" host={{ done: true, ask: () => {} }} pebble={{ answerId: 'a1', index: 2 }} />)
    fireEvent.click(await screen.findByText('Keep'))
    await waitFor(() => expect(otty.keepPebble).toHaveBeenCalledWith('a1', 2, true))
    fireEvent.click(await screen.findByText('Kept'))
    await waitFor(() => expect(otty.keepPebble).toHaveBeenLastCalledWith('a1', 2, false))
  })

  it('shows a kept one as kept, and offers nothing without a place', async () => {
    otty.keptPebbles.mockResolvedValueOnce([2])
    render(<DrawingCard kind="mermaid" code="pie" host={{ done: true, ask: () => {} }} pebble={{ answerId: 'a1', index: 2 }} />)
    expect(await screen.findByText('Kept')).toBeTruthy()
    cleanup()
    render(<DrawingCard kind="mermaid" code="pie" host={{ done: true, ask: () => {} }} />)
    await screen.findByRole('button', { name: 'Show big' })
    expect(screen.queryByText('Keep')).toBeNull()
  })
})

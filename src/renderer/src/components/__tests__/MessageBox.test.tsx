// @vitest-environment jsdom
// D-62: the one message box, used by the panel and the quick view.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageBox } from '../MessageBox'

afterEach(cleanup)

function box(props: Partial<Parameters<typeof MessageBox>[0]> = {}) {
  const onSend = vi.fn()
  const onStop = vi.fn()
  render(<MessageBox value="Hello" onChange={() => {}} onSend={onSend} onStop={onStop} placeholder="Ask Otty anything…" canSend {...props} />)
  return { onSend, onStop, input: screen.getByPlaceholderText(props.placeholder ?? 'Ask Otty anything…') }
}

describe('the message box', () => {
  it('sends on Enter, not on Shift-Enter or mid-composition', () => {
    const { onSend, input } = box()
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('can’t send with nothing to send', () => {
    box({ canSend: false, value: '' })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true)
  })

  it('shows Stop while answering, and dims the tools until after the answer', () => {
    const { onStop } = box({ busy: true, tools: { onSnip: () => {}, onAttach: () => {} } })
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalled()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Attach files' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Attach files' }).title).toBe('After this answer')
  })

  it('leaves Send out where the sending lives elsewhere', () => {
    box({ noSend: true })
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('while paused, says so, sends nothing on Enter, and offers Carry on in Send’s place (Spec 03)', () => {
    const saveSettings = vi.fn(async () => ({}))
    ;(window as unknown as { otty: object }).otty = { saveSettings }
    const onSend = vi.fn()
    render(<MessageBox value="Hello" onChange={() => {}} onSend={onSend} placeholder="Ask a follow-up…" canSend paused />)
    const input = screen.getByPlaceholderText('Otty is paused')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Paused · Carry on' }))
    expect(saveSettings).toHaveBeenCalledWith({ workPaused: false })
  })

  it('edits the last question on ↑ only when the box is empty', () => {
    const onArrowUp = vi.fn()
    const { input } = box({ onArrowUp })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(onArrowUp).not.toHaveBeenCalled()
    cleanup()
    const empty = box({ onArrowUp, value: '' })
    fireEvent.keyDown(empty.input, { key: 'ArrowUp' })
    expect(onArrowUp).toHaveBeenCalledTimes(1)
  })

  it('holds the tray inside the box, over the text', () => {
    box({ tray: <div className="context-card">A snip</div> })
    const tray = screen.getByText('A snip')
    expect(tray.parentElement?.className).toContain('message-box')
    expect(tray.nextElementSibling?.className).toBe('composer__row')
  })
})

describe('the liquid capsule', () => {
  it('eases every side back to still, and never further than it was pushed', async () => {
    const { settle, capsulePath, kick, MAX_NUDGE } = await import('../Capsule')
    let o = [3, -2, 0, 4]
    for (let t = 0; t < 30; t++) o = settle(o, 16)
    expect(o).toEqual([0, 0, 0, 0])
    expect(Math.max(...[1, 2, 3, 4, 5, 6].map((n) => Math.abs(kick(n).by)))).toBeLessThanOrEqual(MAX_NUDGE)
    expect(capsulePath(100, 40, 12, [0, 0, 0, 0])).toMatch(/^M12,0 Q50,0 88,0/)
  })

  it('lets a drop go on send, and a bare box has no capsule', () => {
    const { input } = box()
    expect(document.querySelector('.capsule')).toBeTruthy()
    expect(document.querySelector('.capsule__drop')).toBeNull()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(document.querySelector('.capsule__drop')).toBeTruthy()
    cleanup()
    box({ bare: true })
    expect(document.querySelector('.capsule')).toBeNull()
  })
})

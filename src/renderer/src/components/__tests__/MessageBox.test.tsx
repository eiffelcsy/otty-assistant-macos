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
})

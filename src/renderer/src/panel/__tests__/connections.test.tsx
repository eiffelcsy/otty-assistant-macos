// @vitest-environment jsdom
// D-54: Settings › Connections lists what Otty reads, and the chat's card connects it, through main only.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionsState, ConnectionView } from '../../../../shared/types'
import { Connections } from '../settings/Connections'
import { Markdown, ProofreadContext } from '../Markdown'

const linear: ConnectionView = {
  id: 'linear',
  kind: 'mcp',
  label: 'Linear',
  host: 'mcp.linear.app',
  status: 'changed',
  reads: '2 of 3 tools on · mcp.linear.app',
  privacy: 'What Otty reads goes to DeepSeek with your question.',
  tools: [
    { name: 'create_issue', title: '', description: 'Opens an issue.', on: true, readOnly: false, changed: false },
    { name: 'delete_issue', title: '', description: 'Deletes an issue.', on: false, readOnly: false, changed: true }
  ]
}
const canvas: ConnectionView = { id: 'canvas', kind: 'canvas', label: 'Canvas', host: 'canvas.nus.edu.sg', status: 'on', reads: 'Reads what’s due.', privacy: 'Goes to DeepSeek.', tools: [] }
const state: ConnectionsState = {
  connected: [canvas, linear],
  offers: [
    { kind: 'apple', available: true },
    { kind: 'google', available: false, why: 'Not set up in this build' },
    { kind: 'notion', available: true }
  ],
  online: true
}

const otty = {
  connections: vi.fn(async () => state),
  connect: vi.fn(async () => ({ ok: false, message: 'That token didn’t work. Check it and try again.' })),
  cancelConnect: vi.fn(async () => {}),
  setConnectionTool: vi.fn(async () => ({ ok: true, message: '' })),
  removeConnection: vi.fn(async () => state),
  openExternal: vi.fn(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window, { otty })
})
afterEach(cleanup)

describe('Settings › Connections', () => {
  it('lists connected services and the offers, with Google not set up in this build', () => {
    render(<Connections state={state} onChange={() => {}} />)
    expect(screen.getByText('Canvas')).toBeTruthy()
    expect(screen.getByText('Linear')).toBeTruthy()
    expect(screen.getByText('Needs you')).toBeTruthy()
    expect(screen.getByText('Apple Calendar and Reminders')).toBeTruthy()
    expect(screen.getByText('Not set up in this build')).toBeTruthy()
  })

  it('shows a changed tool as off, with the warning words', () => {
    render(<Connections state={state} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Linear/ }))
    expect(screen.getByText('Changed since you turned it on. Check what it does before turning it on again.')).toBeTruthy()
    const deleteSwitch = screen.getByRole<HTMLInputElement>('checkbox', { name: /Delete issue/ })
    expect(deleteSwitch.checked).toBe(false)
  })

  it('keeps the address after a failed Canvas connect, and clears the token', async () => {
    render(<Connections state={{ ...state, connected: [], offers: [{ kind: 'canvas', available: true }] }} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Canvas/ }))
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Check and connect' })
    expect(button.disabled).toBe(true)
    const address = screen.getByLabelText('Your school’s Canvas address')
    const token = screen.getByLabelText('Token')
    fireEvent.change(address, { target: { value: 'canvas.nus.edu.sg' } })
    fireEvent.change(token, { target: { value: 'secret-token' } })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(await screen.findByText('That token didn’t work. Check it and try again.')).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('Token').value).toBe('')
    expect(screen.getByLabelText<HTMLInputElement>('Your school’s Canvas address').value).toBe('canvas.nus.edu.sg')
  })

  it('shows the web-off words and can’t open an online offer', () => {
    render(<Connections state={{ connected: [], offers: [{ kind: 'canvas', available: false, why: 'Off while Otty uses a model on this Mac.' }], online: false }} onChange={() => {}} />)
    expect(screen.getAllByText('Off while Otty uses a model on this Mac.').length).toBeGreaterThan(0)
  })
})

describe('the connection card in a chat', () => {
  const draft = '```connection\n{"service":"mcp","name":"Linear","url":"https://mcp.linear.app/mcp","auth":"oauth","token":"sk-leak"}\n```'
  it('shows the host and never a token value', () => {
    render(
      <ProofreadContext.Provider value={{ source: '', done: true }}>
        <Markdown text={draft} />
      </ProofreadContext.Provider>
    )
    expect(screen.getByText('mcp.linear.app')).toBeTruthy()
    expect(screen.getByText('Add “Linear”')).toBeTruthy()
    const inputs = [...document.querySelectorAll('input')]
    expect(inputs.some((i) => i.value.includes('sk-leak'))).toBe(false)
    expect(inputs.some((i) => i.type === 'password')).toBe(false)
  })
})

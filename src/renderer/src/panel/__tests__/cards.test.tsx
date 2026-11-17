// @vitest-environment jsdom
// D-48: the cards under an answer, clicked like a person would. Nothing acts until its button is pressed.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RewindPlan, StepCard } from '../../../../shared/types'
import type { Assistant } from '../../lib/useChat'
import { AssistantMessage } from '../Messages'

const otty = {
  respondConfirm: vi.fn(),
  runStep: vi.fn(async () => {}),
  tickStep: vi.fn(async () => {}),
  checkStep: vi.fn(async () => {}),
  stuckOnStep: vi.fn(async () => {}),
  rewindPlan: vi.fn(async (): Promise<RewindPlan | null> => null),
  rewind: vi.fn(async () => null),
  copyAnswer: vi.fn(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window, { otty })
})
afterEach(cleanup)

const answer = (extra: Partial<Assistant>): Assistant => ({ id: 'a1', role: 'assistant', text: '', tools: [], streaming: false, ...extra })

describe('the confirm card', () => {
  const confirm = { confirmId: 'c1', title: 'Add a reminder?', detail: 'Call mum, today at 5 PM' }

  it('shows what will happen and does nothing until a button is pressed', () => {
    render(<AssistantMessage m={answer({ confirm, streaming: true })} />)
    expect(screen.getByText('Add a reminder?')).toBeTruthy()
    expect(screen.getByText('Call mum, today at 5 PM')).toBeTruthy()
    expect(otty.respondConfirm).not.toHaveBeenCalled()
  })

  it('answers yes or no for that card only', () => {
    render(<AssistantMessage m={answer({ confirm, streaming: true })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, go ahead' }))
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }))
    expect(otty.respondConfirm.mock.calls).toEqual([
      ['c1', true],
      ['c1', false]
    ])
  })
})

describe('the step card', () => {
  const card: StepCard = {
    title: 'Freeze the top row',
    app: { name: 'Numbers', bundleId: 'com.apple.iWork.Numbers', pid: 1 },
    steps: [
      { text: 'Pick the table', done: true },
      { text: 'Open the Table menu', action: { kind: 'menu', path: ['Table', 'Freeze Header Rows'] } },
      { text: 'Delete the old sheet', action: { kind: 'keys', combo: '⌘⌫' }, risky: true },
      { text: 'Check it by hand', action: { kind: 'keys', combo: '⌘S' }, manual: true }
    ]
  }

  it('counts what’s done and offers a button only where Otty can act', () => {
    render(<AssistantMessage m={answer({ steps: card })} />)
    expect(screen.getByText('1 of 4')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Click Table › Freeze Header Rows' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Press for me' })).toHaveLength(1)
  })

  it('runs a step from its own button, by answer and index', async () => {
    render(<AssistantMessage m={answer({ steps: card })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Click Table › Freeze Header Rows' }))
    await waitFor(() => expect(otty.runStep).toHaveBeenCalledWith('a1', 1, undefined))
  })

  it('asks “Sure?” before a risky step, and No leaves it undone', async () => {
    render(<AssistantMessage m={answer({ steps: card })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Press for me' }))
    expect(otty.runStep).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.queryByRole('button', { name: 'Sure?' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Press for me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sure?' }))
    await waitFor(() => expect(otty.runStep).toHaveBeenCalledWith('a1', 2, true))
  })

  it('ticks a step by hand', () => {
    render(<AssistantMessage m={answer({ steps: card })} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Step 1: done' }))
    expect(otty.tickStep).toHaveBeenCalledWith('a1', 0, false)
  })
})

describe('the rewind card', () => {
  const plan: RewindPlan = { undo: [{ id: 'memory:1', label: 'Forget “likes tea”' }, { id: 'job:2', label: 'Stop “Check the news”' }], lasting: ['A reminder was added'] }

  it('lists what goes and what can’t, and undoes only what stays ticked', async () => {
    otty.rewindPlan.mockResolvedValueOnce(plan)
    render(<AssistantMessage m={answer({ text: 'Done.' })} latest />)
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await screen.findByText('Try this again?')
    expect(screen.getByText('A reminder was added')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Forget “likes tea”'))
    const card = screen.getByText('Try this again?').closest('.rewind-card') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(otty.rewind).toHaveBeenCalledWith('a1', ['job:2'], 'retry'))
  })

  it('goes straight ahead when there’s nothing to say', async () => {
    otty.rewindPlan.mockResolvedValueOnce({ undo: [], lasting: [] })
    render(<AssistantMessage m={answer({ text: 'Done.' })} latest />)
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await waitFor(() => expect(otty.rewind).toHaveBeenCalledWith('a1', [], 'retry'))
    expect(screen.queryByText('Try this again?')).toBeNull()
  })
})

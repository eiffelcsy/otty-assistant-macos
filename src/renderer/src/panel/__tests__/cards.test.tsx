// @vitest-environment jsdom
// D-48: the cards under an answer, clicked like a person would. Nothing acts until its button is pressed.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfirmCard as ConfirmCardType, MemoryNote, Receipt, RewindPlan, StepCard } from '../../../../shared/types'
import type { Assistant } from '../../lib/useChat'
import { AssistantMessage } from '../Messages'

const otty = {
  respondConfirm: vi.fn(async () => {}),
  runStep: vi.fn(async () => {}),
  tickStep: vi.fn(async () => {}),
  checkStep: vi.fn(async () => {}),
  stuckOnStep: vi.fn(async () => {}),
  rewindPlan: vi.fn(async (): Promise<RewindPlan | null> => null),
  rewind: vi.fn(async () => null),
  undoReceipt: vi.fn(async () => true),
  openMemories: vi.fn(async () => {}),
  copyAnswer: vi.fn(async () => {}),
  copyText: vi.fn(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window, { otty })
})
afterEach(cleanup)

const answer = (extra: Partial<Assistant>): Assistant => ({ id: 'a1', role: 'assistant', text: '', tools: [], streaming: false, ...extra })

describe('the confirm card (D-60)', () => {
  const read: ConfirmCardType = { kind: 'read', title: 'Read this page?', yes: 'Read it', host: 'jreast.co.jp', rest: '/en/timetable' }
  const reminder: ConfirmCardType = { kind: 'reminder', title: 'Add this reminder?', yes: 'Add it', item: 'Call mum', when: 'Today at 5:00 PM', list: 'In Reminders' }
  const asking = (card: ConfirmCardType) => answer({ confirm: { confirmId: 'c1', card, since: Date.now() }, streaming: true })
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
  const click = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }), { detail: 1 })

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows each kind’s parts and its own words, never a generic yes', () => {
    render(<AssistantMessage m={asking(reminder)} />)
    for (const words of ['Add this reminder?', 'Call mum', 'Today at 5:00 PM', 'In Reminders']) expect(screen.getByText(words)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add it: Call mum' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy()
    expect(screen.queryByText(/Yes, go ahead|No thanks/)).toBeNull()
  })

  it('ignores a click in its first 400 ms, then answers for that card only', () => {
    render(<AssistantMessage m={asking(read)} />)
    wait(300)
    click(/^Read it/)
    expect(otty.respondConfirm).not.toHaveBeenCalled()
    wait(150)
    click(/^Read it/)
    expect(otty.respondConfirm.mock.calls).toEqual([['c1', true]])
  })

  it('takes the keyboard at once, because Tab was already a deliberate step', () => {
    render(<AssistantMessage m={asking(read)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }), { detail: 0 })
    expect(otty.respondConfirm.mock.calls).toEqual([['c1', false]])
  })

  it('approves nothing on Enter on the card itself', () => {
    render(<AssistantMessage m={asking(read)} />)
    wait(500)
    fireEvent.keyDown(screen.getByRole('group', { name: 'Read this page?' }), { key: 'Enter' })
    expect(otty.respondConfirm).not.toHaveBeenCalled()
  })

  it('says why only when main marked the card unusual', () => {
    const { rerender } = render(<AssistantMessage m={asking(read)} />)
    expect(screen.queryByText(/another alphabet|isn’t private|leave your Mac|past this month/)).toBeNull()
    rerender(<AssistantMessage m={asking({ ...read, host: 'xn--jrast-bsa.co.jp', readable: 'jréast.co.jp', unusual: 'alphabet' })} />)
    expect(screen.getByText('This address uses letters from another alphabet.')).toBeTruthy()
    expect(screen.getByText(/jréast\.co\.jp/)).toBeTruthy()
  })

  it('stays, and says so, when main didn’t hear back', async () => {
    otty.respondConfirm.mockRejectedValueOnce(new Error('gone'))
    render(<AssistantMessage m={asking(read)} />)
    wait(500)
    click(/^Read it/)
    await vi.waitFor(() => expect(screen.getByText('Couldn’t send that. Try again.')).toBeTruthy())
  })
})

describe('receipts', () => {
  it('keeps what was decided, with Undo only when main recorded one', async () => {
    const receipts: Receipt[] = [
      { allowed: true, verb: 'Read', what: 'jreast.co.jp' },
      { allowed: false, verb: 'Skipped', what: 'example.com', why: 'you asked something else' },
      { allowed: true, verb: 'Added', what: '“Essay deadline”', undo: { kind: 'reminder', ref: 'r1', label: 'Remove the reminder “Essay deadline”' } }
    ]
    render(<AssistantMessage m={answer({ text: 'Done.', receipts })} />)
    expect(screen.getByText('jreast.co.jp')).toBeTruthy()
    expect(screen.getByText(/you asked something else/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Remove the reminder/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove the reminder “Essay deadline”' }))
    await waitFor(() => expect(otty.undoReceipt).toHaveBeenCalledWith('a1', 2))
  })
})

describe('the Noted line', () => {
  const note = (extra: Partial<MemoryNote>): MemoryNote => ({ memoryId: 1, text: 'is learning Japanese', action: 'added', ...extra })
  const line = () => document.querySelector('.memory-line') as HTMLElement

  it('says what was noted, with Undo and Edit, and draws its pen line only on a live answer', () => {
    const { rerender } = render(<AssistantMessage m={answer({ text: 'Hi', memories: [note({})], live: true })} />)
    expect(line().textContent).toContain('Noted: is learning Japanese')
    expect(line().classList.contains('memory-line--fresh')).toBe(true)
    expect(screen.getByRole('button', { name: 'Edit in the Notebook' })).toBeTruthy()
    rerender(<AssistantMessage m={answer({ text: 'Hi', memories: [note({})] })} />)
    expect(line().classList.contains('memory-line--fresh')).toBe(false)
  })

  it('shows what an update replaced, and an undone line stays, struck through', () => {
    const { rerender } = render(<AssistantMessage m={answer({ text: 'Hi', memories: [note({ action: 'updated', before: 'is learning Spanish' })] })} />)
    expect(line().textContent).toContain('Updated: is learning Japanese (was: is learning Spanish)')
    rerender(<AssistantMessage m={answer({ text: 'Hi', memories: [note({ undone: true })] })} />)
    expect(line().classList.contains('memory-line--undone')).toBe(true)
    expect(line().textContent).toContain('Forgotten')
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull()
  })

  it('folds notes that were only read into one marker with a menu', () => {
    render(<AssistantMessage m={answer({ text: 'Hi', used: [{ memoryId: 1, text: 'likes tea' }, { memoryId: 2, text: 'lives in Hong Kong' }] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Used 2 notes from your Notebook' }))
    expect(screen.getByRole('menu').textContent).toContain('likes tea')
    expect(screen.getByRole('menuitem', { name: 'Open the Notebook' })).toBeTruthy()
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
    await waitFor(() => expect(otty.rewind).toHaveBeenCalledWith('a1', ['job:2'], 'retry', undefined))
  })

  it('offers Shorter, Simpler and In more detail only under the latest finished answer, in one menu (D-58, D-85)', async () => {
    const more = () => screen.queryByRole('button', { name: 'Try another way' })
    const { rerender } = render(<AssistantMessage m={answer({ text: 'Done.' })} />)
    expect(more()).toBeNull()
    rerender(<AssistantMessage m={answer({ text: 'Done…', streaming: true })} latest />)
    expect(more()).toBeNull()
    rerender(<AssistantMessage m={answer({ text: 'Done.' })} latest />)
    fireEvent.click(more()!)
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Shorter', 'Simpler', 'In more detail'])
    otty.rewindPlan.mockResolvedValueOnce({ undo: [], lasting: [] })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Simpler' }))
    await waitFor(() => expect(otty.rewind).toHaveBeenCalledWith('a1', [], 'retry', 'simpler'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('copies the latest answer with ⇧⌘C and tries it again with ⌘R, and an older one with neither (D-85)', async () => {
    const { rerender } = render(<AssistantMessage m={answer({ text: 'Done.' })} />)
    fireEvent.keyDown(window, { key: 'C', metaKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'r', metaKey: true })
    expect(otty.copyText).not.toHaveBeenCalled()
    expect(otty.rewindPlan).not.toHaveBeenCalled()
    rerender(<AssistantMessage m={answer({ text: 'Done.' })} latest />)
    fireEvent.keyDown(window, { key: 'C', metaKey: true, shiftKey: true })
    expect(otty.copyText).toHaveBeenCalledWith('Done.')
    otty.rewindPlan.mockResolvedValueOnce({ undo: [], lasting: [] })
    fireEvent.keyDown(window, { key: 'r', metaKey: true })
    await waitFor(() => expect(otty.rewind).toHaveBeenCalledWith('a1', [], 'retry', undefined))
  })

  it('goes straight ahead when there’s nothing to say', async () => {
    otty.rewindPlan.mockResolvedValueOnce({ undo: [], lasting: [] })
    render(<AssistantMessage m={answer({ text: 'Done.' })} latest />)
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await waitFor(() => expect(otty.rewind).toHaveBeenCalledWith('a1', [], 'retry', undefined))
    expect(screen.queryByText('Try this again?')).toBeNull()
  })
})

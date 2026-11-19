// @vitest-environment jsdom
// D-63: the Logbook lays out main's words and sends ids back. Entries of each kind, the Now card, details, Undo.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogDetails, LogPage } from '../../../../shared/types'
import { Logbook } from '../logbook/Logbook'

const page = (over: Partial<LogPage> = {}): LogPage => ({
  view: 'all',
  title: 'Everything',
  subtitle: 'this week',
  views: [
    { view: 'wait', name: 'Needs you', count: 1 },
    { view: 'next', name: 'Coming up', count: 0 },
    { view: 'all', name: 'Everything', count: 3 },
    { view: 'sent', name: 'What left my Mac', count: 1, description: 'Questions, searches, pages' },
    { view: 'changed', name: 'What Otty changed', count: 1, description: 'Reminders, looks, steps' },
    { view: 'noted', name: 'What Otty noted', count: 0, description: 'Learned, updated, forgot' }
  ],
  now: [],
  days: [
    {
      date: '2026-11-19',
      title: 'Today',
      count: '3 entries',
      entries: [
        { id: 'job:w', at: 3, time: '3:44', glyph: 'hourglass-end', tone: 'wait', first: 'Waiting: read jreast.co.jp?', strong: 'jreast.co.jp', second: 'Part of “Trains”', action: { kind: 'decide', label: 'Decide' }, label: 'w' },
        { id: 'act:4', at: 2, time: '3:40', glyph: 'alarm-clock', first: 'Reminder added: Call mum', second: 'Trip plans', action: { kind: 'undo', label: 'Undo' }, label: 'r' },
        { id: 'act:3', at: 1, time: '3:30', glyph: 'bookmark', first: 'Noted: likes tea', second: 'Undone', undone: true, label: 'n' }
      ]
    },
    { date: '2026-11-10', title: 'Mon 10 Nov', count: '9 entries', entries: [], folded: true }
  ],
  empty: 'Nothing yet.',
  ...over
})

const details: LogDetails = {
  id: 'job:w',
  title: 'Waiting: read jreast.co.jp?',
  time: 'Today at 3:44',
  why: 'Your look-up “Trains” found this page and needs your OK to read it.',
  sent: [],
  changes: [],
  partOf: { label: 'Trip plans', chatId: 'c1' },
  controls: [
    { kind: 'allow', label: 'Allow', primary: true },
    { kind: 'deny', label: 'Don’t allow' }
  ],
  waitUrl: 'https://jreast.co.jp/en'
}

let current = page()
const otty = {
  logbook: vi.fn(async () => current),
  logbookEntry: vi.fn(async () => details),
  undoChange: vi.fn(async () => true),
  noteJob: vi.fn(async () => true),
  answerActivity: vi.fn(async () => {}),
  stopActivity: vi.fn(async () => {}),
  seenActivity: vi.fn(async () => {}),
  saveSettings: vi.fn(async () => ({})),
  onLogbook: vi.fn(() => () => {})
}

beforeEach(() => {
  current = page()
  vi.clearAllMocks()
  ;(window as unknown as { otty: typeof otty }).otty = otty
})
afterEach(cleanup)

describe('Logbook (D-63)', () => {
  it('shows main’s words: the thing acted on in bold, one action, undone struck through, older days folded', async () => {
    render(<Logbook onOpenChat={() => {}} />)
    await screen.findByText('Today')
    expect(screen.getByText('jreast.co.jp').tagName).toBe('B')
    const undone = screen.getByText('Noted: likes tea').closest('li')!
    expect(undone.className).toContain('log-entry--undone')
    expect(within(undone).queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show 9 entries' })).toBeTruthy()
  })

  it('sends Undo with the entry’s id, and asks again', async () => {
    render(<Logbook onOpenChat={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(otty.undoChange).toHaveBeenCalledWith('act:4'))
    await waitFor(() => expect(otty.logbook).toHaveBeenCalledTimes(2))
  })

  it('opens an entry on Decide, and Allow answers that look-up by its id; Part of opens the chat', async () => {
    const onOpenChat = vi.fn()
    render(<Logbook onOpenChat={onOpenChat} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Decide' }))
    expect(await screen.findByText('https://jreast.co.jp/en')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(otty.answerActivity).toHaveBeenCalledWith('w', true))
    fireEvent.click(screen.getByRole('button', { name: /Trip plans/ }))
    expect(onOpenChat).toHaveBeenCalledWith('c1')
  })

  it('a Now card: progress for screen readers, a note sent by id, and Stopping… after Stop', async () => {
    current = page({ now: [{ id: 'run', title: 'Visa rules', line: 'Page 3 of about 6', done: 2, expected: 6, paused: false }] })
    render(<Logbook onOpenChat={() => {}} />)
    const bar = await screen.findByRole('progressbar', { name: 'Page 3 of about 6' })
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
    expect(bar.querySelectorAll('.log-now__seg--done')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }))
    const field = screen.getByPlaceholderText('Tell it something, like “only check JR East”')
    fireEvent.change(field, { target: { value: 'only JR East' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(otty.noteJob).toHaveBeenCalledWith('run', 'only JR East'))
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(await screen.findByRole('button', { name: 'Stopping…' })).toBeTruthy()
    expect(otty.stopActivity).toHaveBeenCalledWith({ id: 'run' })
  })

  it('a paused Now card offers only Carry on, and the paused line says until when', async () => {
    current = page({ paused: 'Otty is paused until today at 3:00 PM. Nothing runs on its own.', now: [{ id: 'run', title: 'Visa rules', line: 'Paused', done: 2, expected: 6, paused: true }] })
    render(<Logbook onOpenChat={() => {}} />)
    expect((await screen.findByRole('status')).textContent).toContain('paused until today at 3:00 PM')
    const card = screen.getByText('Visa rules').closest('.log-now') as HTMLElement
    expect(within(card).queryByRole('button', { name: 'Add a note' })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Carry on' }))
    expect(otty.saveSettings).toHaveBeenCalledWith({ workPaused: false })
  })

  it('searches through main, never in the renderer', async () => {
    render(<Logbook onOpenChat={() => {}} />)
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search the Logbook' }), { target: { value: 'jreast' } })
    await waitFor(() => expect(otty.logbook).toHaveBeenLastCalledWith('all', 'jreast'))
  })
})

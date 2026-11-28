// @vitest-environment jsdom
// D-66: Home shows only the blocks with something in them, in main's words, and deciding sends the Logbook's id.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarItem, CalendarRange, HomePage } from '../../../../shared/types'
import { Home } from '../Home'

const quiet: HomePage = {
  date: 'Wednesday 19 November',
  greeting: 'Good afternoon',
  status: 'Nothing needs you. Ask me anything.',
  now: [],
  needs: { items: [], total: 0 },
  today: { date: 'Wed 19 Nov', ticks: [], folded: 0 },
  after: { items: [], total: 0 },
  left: [{ text: 'Nothing has left your Mac today.' }],
  firstRun: false
}

let page: HomePage = quiet
const otty = {
  home: vi.fn(async () => page),
  onLogbook: vi.fn(() => () => {}),
  answerActivity: vi.fn(async () => {}),
  calendarRange: vi.fn(async (): Promise<CalendarRange> => ({ items: [] }))
}
beforeEach(() => {
  page = quiet
  vi.clearAllMocks()
  ;(window as unknown as { otty: typeof otty }).otty = otty
})
afterEach(cleanup)

const home = (props: Partial<Parameters<typeof Home>[0]> = {}) =>
  render(
    <Home
      onOpenChat={() => {}}
      onOpenEntry={() => {}}
      onOpenLogbook={() => {}}
      onSuggest={() => {}}
      suggestions={['What can you do?']}
      widgets={['today', 'after']}
      tiles={[]}
      onWidgets={() => {}}
      onAsk={() => {}}
      onOpenCalendar={() => {}}
      onMakeTile={() => {}}
      {...props}
    />
  )

describe('Home (Spec 06)', () => {
  it('quiet: the greeting, the sentence and what left the Mac, and no empty blocks', async () => {
    home()
    expect(await screen.findByRole('heading', { name: 'Good afternoon' })).toBeTruthy()
    expect(screen.getByText('Nothing needs you. Ask me anything.')).toBeTruthy()
    expect(screen.getByText('Nothing has left your Mac today.')).toBeTruthy()
    expect(screen.getByText('Wednesday 19 November')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Otty' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Today' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Try asking' })).toBeNull()
  })

  it('a waiting look-up: Read it answers it by its id', async () => {
    page = {
      ...quiet,
      needs: { total: 1, items: [{ id: 'job:w', glyph: 'hourglass-end', question: 'Waiting: read jreast.co.jp?', subject: 'https://jreast.co.jp/en', since: 'since 3:52', actions: [{ kind: 'allow', label: 'Read it', primary: true }, { kind: 'deny', label: 'Skip' }] }] }
    }
    home()
    fireEvent.click(await screen.findByRole('button', { name: 'Read it' }))
    await waitFor(() => expect(otty.answerActivity).toHaveBeenCalledWith('w', true))
  })

  it('a tick opens its Logbook entry, and the first run offers things to try that fill the box', async () => {
    const onOpenEntry = vi.fn()
    const onSuggest = vi.fn()
    page = { ...quiet, firstRun: true, today: { date: 'Wed 19 Nov', folded: 0, ticks: [{ id: 'job:d', time: '9:00', state: 'done', title: 'Train times', text: [{ text: 'Train times', strong: true }, { text: ', looked into' }] }] } }
    home({ onOpenEntry, onSuggest })
    fireEvent.click(await screen.findByRole('button', { name: '9:00, done, Train times' }))
    expect(onOpenEntry).toHaveBeenCalledWith('job:d')
    fireEvent.click(screen.getByRole('button', { name: 'What can you do?' }))
    expect(onSuggest).toHaveBeenCalledWith('What can you do?')
  })

  describe('widgets (D-86)', () => {
    const event = (title: string, start: number, mins = 60): CalendarItem => ({ id: title, title, start, end: start + mins * 60_000, allDay: false, source: 'Otty', readOnly: false })

    it('Calendar lists what’s left of today and opens the Calendar', async () => {
      const now = Date.now()
      otty.calendarRange.mockResolvedValueOnce({ items: [event('Done earlier', now - 3 * 3600_000), event('Dentist', now + 3600_000)] })
      const onOpenCalendar = vi.fn()
      home({ widgets: ['calendar'], onOpenCalendar })
      expect(await screen.findByText('Dentist')).toBeTruthy()
      expect(screen.queryByText('Done earlier')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Open Calendar' }))
      expect(onOpenCalendar).toHaveBeenCalled()
    })

    it('a clear day says so, and the widget can be off', async () => {
      home({ widgets: ['calendar'] })
      expect(await screen.findByText('A clear day.')).toBeTruthy()
      cleanup()
      home({ widgets: [] })
      await screen.findByRole('heading', { name: 'Good afternoon' })
      expect(screen.queryByRole('region', { name: 'Calendar' })).toBeNull()
    })

    it('My tiles asks a tile’s question, and shows only tiles that need nothing highlighted', async () => {
      const onAsk = vi.fn()
      home({
        widgets: ['tiles'],
        onAsk,
        tiles: [
          { id: 'a', name: 'Plan my week', icon: 'calendar', prompt: 'Help me plan my week.', when: 'any' },
          { id: 'b', name: 'Flashcards', icon: 'layers', prompt: 'Make flashcards.', when: 'text' }
        ]
      })
      fireEvent.click(await screen.findByText('Plan my week'))
      expect(onAsk).toHaveBeenCalledWith('Help me plan my week.')
      expect(screen.queryByText('Flashcards')).toBeNull()
    })

    it('Customise Home turns a widget off and keeps the rest', async () => {
      const onWidgets = vi.fn()
      home({ widgets: ['calendar', 'tiles'], onWidgets })
      fireEvent.click(await screen.findByRole('button', { name: 'Customise Home' }))
      expect(screen.getByRole('menuitemcheckbox', { name: 'Calendar' }).getAttribute('aria-checked')).toBe('true')
      expect(screen.getByRole('menuitemcheckbox', { name: 'Today' }).getAttribute('aria-checked')).toBe('false')
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Calendar' }))
      expect(onWidgets).toHaveBeenCalledWith(['tiles'])
    })
  })
})

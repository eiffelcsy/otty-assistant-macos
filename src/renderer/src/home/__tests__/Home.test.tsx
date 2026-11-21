// @vitest-environment jsdom
// D-66: Home shows only the blocks with something in them, in main's words, and deciding sends the Logbook's id.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomePage } from '../../../../shared/types'
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
const otty = { home: vi.fn(async () => page), onLogbook: vi.fn(() => () => {}), answerActivity: vi.fn(async () => {}) }
beforeEach(() => {
  page = quiet
  vi.clearAllMocks()
  ;(window as unknown as { otty: typeof otty }).otty = otty
})
afterEach(cleanup)

const home = (props: Partial<Parameters<typeof Home>[0]> = {}) =>
  render(<Home onOpenChat={() => {}} onOpenEntry={() => {}} onOpenLogbook={() => {}} onSuggest={() => {}} suggestions={['What can you do?']} {...props} />)

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
})

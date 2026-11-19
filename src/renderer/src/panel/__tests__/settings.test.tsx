// @vitest-environment jsdom
// D-61: Settings saves each control as it changes, through main, and forgets nothing without a hold.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicSettings, SettingsCounts } from '../../../../shared/types'
import { accelerator, HOLD_MS } from '../settings/rows'
import { Settings, type SectionId } from '../settings/Settings'

const base: PublicSettings = {
  hasApiKey: true,
  needsKey: true,
  savedKeys: ['deepseek'],
  keychain: true,
  readsPages: true,
  apiFormat: 'auto',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  thinking: false,
  showBubble: true,
  askHotkey: 'Alt+Space',
  snapHotkey: 'Alt+Shift+Space',
  screenHotkey: 'Command+Alt+Shift+Space',
  takenHotkeys: [],
  onboarded: true,
  shareAppContext: true,
  rememberChats: true,
  keepChats: '1y',
  homeLanguage: 'zh-HK',
  learn: true,
  workPaused: false,
  workPausedUntil: null,
  notifyDone: false,
  openAtLogin: false,
  monthlyCap: null,
  capNoticed: null,
  canOpenAtLogin: true
}
const counts: SettingsCounts = { chats: 142, olderThan: { '30d': 23, '1y': 0, forever: 0 }, notes: 18 }

const otty = {
  setSetting: vi.fn(async (key: string, value: unknown): Promise<PublicSettings | null> => ({ ...base, [key]: value })),
  settingsCounts: vi.fn(async () => counts),
  getUsage: vi.fn(async () => ({ days: 30, questions: 4, tokens: 0, searches: 0, pages: 0, jobs: 0, service: 'DeepSeek', month: { questions: 4, tokens: 0 } })),
  clearChats: vi.fn(async () => {}),
  clearMemories: vi.fn(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(window, { otty })
})
afterEach(cleanup)

function open(section: SectionId | null, settings = base) {
  const onSaved = vi.fn()
  render(<Settings settings={settings} onSaved={onSaved} section={section} onSection={() => {}} onOpenLogbook={() => {}} onOpenNotebook={() => {}} />)
  return onSaved
}

describe('each kind of row saves through main as it changes', () => {
  it('a switch', async () => {
    const onSaved = open('you')
    fireEvent.click(screen.getByRole('checkbox', { name: /Tell me when something is ready/ }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ notifyDone: true })))
    expect(otty.setSetting).toHaveBeenCalledWith('notifyDone', true)
    expect(await screen.findByText('Saved')).toBeTruthy()
  })

  it('a choice', async () => {
    open('you')
    fireEvent.change(screen.getByRole('combobox', { name: 'Help in my own language' }), { target: { value: 'none' } })
    await waitFor(() => expect(otty.setSetting).toHaveBeenCalledWith('homeLanguage', null))
  })

  it('a shortcut, recorded as a whole chord; Esc and a lone modifier change nothing', async () => {
    open('keys')
    fireEvent.click(screen.getByRole('button', { name: /^Ask about highlighted text: Alt\+Space/ }))
    const field = screen.getByRole('button', { name: /recording/ })
    fireEvent.keyDown(field, { key: 'Shift', code: 'ShiftLeft', shiftKey: true })
    expect(otty.setSetting).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'k', code: 'KeyK', altKey: true, metaKey: true })
    await waitFor(() => expect(otty.setSetting).toHaveBeenCalledWith('askHotkey', 'Alt+Command+K'))
    await screen.findByText('Saved')
    fireEvent.click(screen.getByRole('button', { name: /^Snip part of the screen/ }))
    fireEvent.keyDown(screen.getByRole('button', { name: /recording/ }), { key: 'Escape', code: 'Escape' })
    expect(otty.setSetting).toHaveBeenCalledTimes(1)
  })

  it('the limit, on Enter', async () => {
    open('usage', { ...base, monthlyCap: { unit: 'questions', limit: 300 } })
    const field = await screen.findByRole('textbox', { name: 'Limit' })
    fireEvent.change(field, { target: { value: '120' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(otty.setSetting).toHaveBeenCalledWith('monthlyCap', { unit: 'questions', limit: 120 }))
  })

  it('puts the old value back and says so when the save fails', async () => {
    otty.setSetting.mockResolvedValueOnce(null)
    const onSaved = open('you')
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: /Show the floating otter/ })
    fireEvent.click(box)
    expect(await screen.findByText('Couldn’t save that. Try again.')).toBeTruthy()
    expect(box.checked).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('forgetting needs the hold, with the real count', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const settle = () => act(() => Promise.resolve())

  it('turning Remember my chats off asks first, and a short press forgets nothing', async () => {
    open('privacy')
    await settle()
    fireEvent.click(screen.getByRole('checkbox', { name: /Remember my chats/ }))
    await settle()
    const hold = within(screen.getByRole('group', { name: 'Turn off and forget 142 chats?' })).getByRole('button', { name: 'Hold to forget' })
    fireEvent.pointerDown(hold)
    await act(async () => void vi.advanceTimersByTime(HOLD_MS - 100))
    fireEvent.pointerUp(hold)
    await act(async () => void vi.advanceTimersByTime(500))
    expect(otty.setSetting).not.toHaveBeenCalled()
    fireEvent.pointerDown(hold)
    await act(async () => void vi.advanceTimersByTime(HOLD_MS))
    expect(otty.setSetting.mock.calls).toEqual([['rememberChats', false]])
  })

  it('a shorter Keep chats for that would forget some asks; Keep them changes nothing', async () => {
    open('privacy')
    await settle()
    fireEvent.change(screen.getByRole('combobox', { name: 'Keep chats for' }), { target: { value: '30d' } })
    await settle()
    expect(screen.getByText('Forget 23 chats older than 30 days?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep them' }))
    expect(otty.setSetting).not.toHaveBeenCalled()
  })

  it('one that forgets none just saves', async () => {
    open('privacy')
    await settle()
    fireEvent.change(screen.getByRole('combobox', { name: 'Keep chats for' }), { target: { value: 'forever' } })
    await settle()
    expect(otty.setSetting).toHaveBeenCalledWith('keepChats', 'forever')
  })
})

describe('the list and Find a setting', () => {
  it('shows six sections with their summaries, and finds rows by other words', () => {
    open(null)
    expect(screen.getAllByRole('button').filter((b) => b.classList.contains('set-row--section'))).toHaveLength(6)
    expect(screen.getByText('⌥ Space to ask about highlighted text')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a setting' }), { target: { value: 'memory' } })
    expect(screen.getByText('Open the Notebook')).toBeTruthy()
    expect(screen.getByText('Forget everything in the Notebook')).toBeTruthy()
  })
})

it('puts the old shortcut back when another app owns the new one', async () => {
  otty.setSetting.mockImplementation(async (key: string, value: unknown) => ({ ...base, [key]: value, takenHotkeys: value === 'Alt+Command+K' ? ['Alt+Command+K'] : [] }))
  open('keys')
  fireEvent.click(screen.getByRole('button', { name: /^Ask about highlighted text/ }))
  fireEvent.keyDown(screen.getByRole('button', { name: /recording/ }), { key: 'k', code: 'KeyK', altKey: true, metaKey: true })
  expect(await screen.findByText('Another app uses this. Pick a different one.')).toBeTruthy()
  expect(otty.setSetting.mock.calls).toEqual([
    ['askHotkey', 'Alt+Command+K'],
    ['askHotkey', 'Alt+Space']
  ])
})

it('records a chord as an Electron accelerator', () => {
  const press = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>>) => accelerator({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods })
  expect(press('Space', { altKey: true, shiftKey: true })).toBe('Alt+Shift+Space')
  expect(press('Digit4', { metaKey: true, shiftKey: true })).toBe('Shift+Command+4')
  expect(press('KeyA', {})).toBeNull()
  expect(press('ShiftLeft', { shiftKey: true })).toBeNull()
})

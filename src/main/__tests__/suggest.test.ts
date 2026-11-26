import { beforeEach, describe, expect, it, vi } from 'vitest'

// D-80: suggestHotkey tries a fixed list with globalShortcut, skipping Otty's other two shortcuts.
const shortcut = vi.hoisted(() => ({ taken: new Set<string>(), register: vi.fn(), unregister: vi.fn() }))
const stored = vi.hoisted(() => ({ askHotkey: 'Alt+Space', snapHotkey: 'Alt+Shift+Space', screenHotkey: 'Command+Alt+Shift+Space' }))

vi.mock('electron', () => ({
  app: {},
  globalShortcut: { register: shortcut.register, unregister: shortcut.unregister, unregisterAll: vi.fn() },
  Menu: {},
  Tray: class {}
}))
vi.mock('../settings', () => ({ getStored: () => stored, update: vi.fn(), setTakenHotkeys: vi.fn() }))
vi.mock('../captureRoute', () => ({}))
vi.mock('../core', () => ({ activityChanged: vi.fn(), chat: {}, forgetAllChats: vi.fn(), jobs: {}, tidyOldChats: vi.fn() }))
vi.mock('../notify', () => ({ tellSettings: vi.fn() }))
vi.mock('../trayIcon', () => ({ trayIcon: vi.fn() }))
vi.mock('../roomy', () => ({ setAppMenu: vi.fn() }))
vi.mock('../windows', () => ({ expandPanel: vi.fn(), getBubble: vi.fn(), getPanel: vi.fn(), openSettings: vi.fn(), shrinkPanel: vi.fn() }))

import { suggestHotkey } from '../controls'

beforeEach(() => {
  shortcut.taken = new Set()
  shortcut.register.mockReset().mockImplementation((accel: string) => !shortcut.taken.has(accel))
  shortcut.unregister.mockReset()
  Object.assign(stored, { askHotkey: 'Alt+Space', snapHotkey: 'Alt+Shift+Space', screenHotkey: 'Command+Alt+Shift+Space' })
})

describe('suggestHotkey (D-80)', () => {
  it('returns the first candidate that registers, and undoes its test registration', () => {
    shortcut.taken = new Set(['Alt+Space', 'Control+Alt+Space'])
    expect(suggestHotkey('askHotkey')).toBe('Alt+Shift+A')
    expect(shortcut.unregister).toHaveBeenCalledWith('Alt+Shift+A')
    expect(shortcut.unregister).toHaveBeenCalledTimes(1)
  })

  it('skips the other two Otty shortcuts even when they are free', () => {
    stored.snapHotkey = 'Alt+Shift+A'
    shortcut.taken = new Set(['Alt+Space', 'Control+Alt+Space'])
    expect(suggestHotkey('askHotkey')).toBe('Control+Shift+Space')
    expect(shortcut.register).not.toHaveBeenCalledWith('Alt+Shift+A', expect.any(Function))
  })

  it('treats a candidate that throws as taken', () => {
    shortcut.register.mockImplementation((accel: string) => {
      if (accel === 'Alt+Space') throw new Error('invalid')
      return true
    })
    expect(suggestHotkey('askHotkey')).toBe('Control+Alt+Space')
  })

  it('returns null when none registers', () => {
    shortcut.register.mockReturnValue(false)
    expect(suggestHotkey('snapHotkey')).toBeNull()
    expect(shortcut.unregister).not.toHaveBeenCalled()
  })
})

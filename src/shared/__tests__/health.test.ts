import { describe, expect, it } from 'vitest'
import { healthProblem } from '../health'

const keys = { askHotkey: 'Alt+Space', snapHotkey: 'Alt+Shift+Space', screenHotkey: 'Command+Alt+Shift+Space', takenHotkeys: [] as string[] }
const mac = (accessibility: boolean, screen: boolean) => ({ platform: 'darwin', accessibility, screen })

describe('healthProblem', () => {
  it('is quiet when everything works, or before it knows', () => {
    expect(healthProblem(mac(true, true), keys)).toBeNull()
    expect(healthProblem(null, keys)).toBeNull()
  })

  it('puts Accessibility first, because the main shortcut needs it', () => {
    expect(healthProblem(mac(false, false), { ...keys, takenHotkeys: ['Alt+Space'] })).toEqual({ kind: 'accessibility' })
  })

  it('names a shortcut another app owns, before Screen Recording', () => {
    expect(healthProblem(mac(true, false), { ...keys, takenHotkeys: ['Alt+Shift+Space'] })).toEqual({ kind: 'hotkey', hotkey: 'Alt+Shift+Space', what: 'snapping part of the screen' })
    expect(healthProblem(mac(true, false), keys)).toEqual({ kind: 'screen' })
  })

  it('never asks for macOS permissions elsewhere', () => {
    expect(healthProblem({ platform: 'win32', accessibility: false, screen: false }, keys)).toBeNull()
  })
})

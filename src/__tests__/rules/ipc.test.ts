// D-44 / LAUNCH_READINESS 10.5: main checks everything a window sends. Every handler goes through `handle` or `on` in
// src/main/ipc/check.ts, and the preload uses only channels its table lists.
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { findIn, read, sourceFiles } from './source'

const registered = new Map<string, (e: unknown, ...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, ...a: unknown[]) => unknown) => registered.set(channel, fn),
    on: (channel: string, fn: (e: unknown, ...a: unknown[]) => unknown) => registered.set(channel, fn)
  }
}))
const { CHANNELS, SETTABLE, handle, on, setView } = await import('../../main/ipc/check')
type Channel = keyof typeof CHANNELS

const channels = Object.keys(CHANNELS) as Channel[]

describe('IPC goes through one checked table', () => {
  it('registers no handler outside ipc/check.ts', () => {
    const found = sourceFiles('src/main')
      .filter((f) => f !== 'src/main/ipc/check.ts')
      .flatMap((f) => findIn(f, /ipcMain\.(handle|on|handleOnce|once)\(/g))
    expect(found, 'register through handle() or on() from ipc/check.ts').toEqual([])
  })

  it('lists exactly the channels the preload uses', () => {
    const used = [...read('src/preload/index.ts').matchAll(/ipcRenderer\.(?:invoke|send)\('([^']+)'/g)].map((m) => m[1])
    expect([...new Set(used)].sort()).toEqual([...channels].sort())
  })
})

describe('a checked handler', () => {
  const frame = {}
  const contents = (view: string | null) => {
    const c = { mainFrame: frame }
    if (view) setView(c as never, view as never)
    return c
  }
  const panel = contents('panel')
  const calls = new Map<Channel, unknown[][]>()
  for (const c of channels) {
    const spy = (_e: unknown, ...args: unknown[]) => void calls.set(c, [...(calls.get(c) ?? []), args])
    if (c === 'quick:resize' || c === 'quick:state' || c === 'bubble:drag' || c === 'bubble:menu') on(c, spy)
    else handle(c, spy)
  }
  const send = (c: Channel, sender: object, senderFrame: object | null, args: unknown[]) => registered.get(c)!({ sender, senderFrame }, ...args)

  it('never throws on wrong input, and runs only with arguments that fit', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fc.assert(
      fc.property(fc.constantFrom(...channels), fc.array(fc.anything(), { maxLength: 4 }), (c, args) => {
        calls.delete(c)
        const view = CHANNELS[c].views[0]
        expect(() => send(c, contents(view), frame, args)).not.toThrow()
        const fits = args.length <= CHANNELS[c].args.length && CHANNELS[c].args.every((g: (x: unknown) => boolean, i: number) => g(args[i]))
        expect(calls.has(c)).toBe(fits)
      }),
      { numRuns: 2_000 }
    )
  })

  it('refuses a view that doesn’t use the channel, an unknown sender and a subframe', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    calls.clear()
    send('chats:clear', contents('bubble'), frame, [])
    send('chats:clear', contents(null), frame, [])
    send('chats:clear', panel, {}, [])
    send('chats:clear', panel, null, [])
    expect(calls.has('chats:clear')).toBe(false)
    send('chats:clear', panel, frame, [])
    expect(calls.get('chats:clear')).toEqual([[]])
  })
})

describe('one setting at a time (D-61)', () => {
  // Wrong values for every key Settings may change. Each must be refused before anything is saved.
  const BAD: Record<keyof typeof SETTABLE, unknown[]> = {
    showBubble: ['yes', 1, null],
    notifyDone: ['true', 0],
    openAtLogin: [{}],
    thinking: ['on'],
    shareAppContext: [[]],
    rememberChats: [undefined, 'false'],
    learn: [null],
    keepChats: ['7d', 30, null],
    homeLanguage: ['fr', 'zh', 0],
    languageSwitch: ['yes', 1, 0, undefined],
    askHotkey: ['', 'Alt+Space; rm -rf ~', 'x'.repeat(61), 42],
    snapHotkey: ['Alt Shift Space', null],
    screenHotkey: ['Command+Alt+⌘'],
    monthlyCap: [],
    capNoticed: ['2026-1', 'November', null, 202611],
    myTiles: [
      null,
      [{ id: 'a', name: 'x'.repeat(31), icon: 'star', prompt: 'p', when: 'any' }],
      [{ id: 'a', name: 'Flashcards', icon: 'star', prompt: 'p'.repeat(1001), when: 'any' }],
      [{ id: 'a', name: 'Flashcards', icon: 'https://x', prompt: 'p', when: 'any' }],
      [{ id: 'a', name: 'Flashcards', icon: 'star', prompt: 'p', when: 'email' }],
      Array.from({ length: 13 }, (_, i) => ({ id: `t${i}`, name: 'n', icon: 'star', prompt: 'p', when: 'any' }))
    ],
    homeWidgets: [null, 'calendar', ['needs'], ['calendar', 'calendar'], [{ id: 'feature:x' }]]
  }
  const GOOD: Record<keyof typeof SETTABLE, unknown> = {
    showBubble: false,
    notifyDone: true,
    openAtLogin: true,
    thinking: false,
    shareAppContext: true,
    rememberChats: false,
    learn: true,
    keepChats: '30d',
    homeLanguage: null,
    languageSwitch: true,
    askHotkey: 'Alt+Shift+Space',
    snapHotkey: 'Command+4',
    screenHotkey: 'Control+F5',
    monthlyCap: { unit: 'questions', limit: 300 },
    capNoticed: '2026-11',
    myTiles: [{ id: 'a', name: 'Make flashcards', icon: 'layers', prompt: 'Turn this into flashcards.', when: 'text' }],
    homeWidgets: ['calendar', 'tiles']
  }

  it.each(Object.keys(SETTABLE) as (keyof typeof SETTABLE)[])('%s refuses what isn’t one, and takes what is', (key) => {
    for (const v of BAD[key]) expect(SETTABLE[key](v), String(v)).toBe(false)
    expect(SETTABLE[key](GOOD[key])).toBe(true)
  })

  it('takes only those keys, never the connection or a pause', () => {
    const [keyGuard] = CHANNELS['settings:set'].args
    for (const key of ['apiKey', 'baseUrl', 'model', 'workPaused', 'onboarded', '__proto__']) expect(keyGuard(key), key).toBe(false)
  })

  it('settings:save takes what the windows send, and nothing that is main’s own', () => {
    const [save] = CHANNELS['settings:save'].args
    for (const ok of [{ baseUrl: 'https://api.deepseek.com', model: 'm', apiFormat: 'auto', apiKey: 'sk-x' }, { onboarded: true }, { workPaused: true, workPausedUntil: null }, { homeLanguage: 'zh-HK' }])
      expect(save(ok), JSON.stringify(ok)).toBe(true)
    for (const bad of [{ apiKeys: {} }, { windowBounds: {} }, { keychain: true }, { apiKey: 5 }, { askHotkey: 'Cmd+;rm' }, { workPaused: 'yes' }, JSON.parse('{"__proto__":{}}')])
      expect(save(bad), JSON.stringify(bad)).toBe(false)
  })
})

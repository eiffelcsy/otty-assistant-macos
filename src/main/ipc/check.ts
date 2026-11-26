import type { SettableKey, SettingsUpdate } from '../../shared/types'
import { validTiles } from '../../shared/tiles'
import { cleanShelf } from '../pebbles'
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'

// D-44: a compromised renderer is what the sandbox is for, so main checks everything a window sends. Each channel
// says which views may use it and what each argument must be, in one table. `handle` and `on` refuse a message from
// another view or a subframe, or with an argument that doesn't fit, with a log line and no answer the UI could show.
// A rule test fails on any `ipcMain.handle` or `ipcMain.on` outside this file, and on a preload channel not listed.

export type View = 'bubble' | 'panel' | 'quick' | 'pickup' | 'viewer'
export type Guard = (x: unknown) => boolean

export const id: Guard = (x) => typeof x === 'string' && x.length > 0 && x.length <= 200
export const text =
  (max: number): Guard =>
  (x) =>
    typeof x === 'string' && x.length <= max
export const bool: Guard = (x) => typeof x === 'boolean'
export const num =
  (min: number, max: number): Guard =>
  (x) =>
    typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max
export const int =
  (min: number, max: number): Guard =>
  (x) =>
    Number.isInteger(x) && num(min, max)(x)
export const oneOf =
  (...values: unknown[]): Guard =>
  (x) =>
    values.includes(x)
export const optional =
  (g: Guard): Guard =>
  (x) =>
    x === undefined || x === null || g(x)
export const record: Guard = (x) => typeof x === 'object' && x !== null && !Array.isArray(x)
export const list =
  (g: Guard, max: number): Guard =>
  (x) =>
    Array.isArray(x) && x.length <= max && x.every(g)
/** For an argument main checks properly further on (`cleanCap`, `validExport`, `registerFiles`). */
export const checkedLater: Guard = () => true

/** An Electron accelerator as the shortcut recorder writes it: "Alt+Shift+Space". */
const hotkey: Guard = (x) => typeof x === 'string' && /^[A-Za-z0-9+]{1,60}$/.test(x)

/**
 * What Settings may change one at a time (D-61), each with its check. The connection isn't here: it goes through
 * `settings:save`, which tests it. `monthlyCap` is cleaned by `cleanCap` as it's saved.
 */
export const SETTABLE = {
  showBubble: bool,
  notifyDone: bool,
  openAtLogin: bool,
  thinking: bool,
  shareAppContext: bool,
  rememberChats: bool,
  learn: bool,
  keepChats: oneOf('30d', '1y', 'forever'),
  homeLanguage: oneOf(null, 'zh-HK'),
  askHotkey: hotkey,
  snapHotkey: hotkey,
  screenHotkey: hotkey,
  monthlyCap: checkedLater,
  capNoticed: (x) => typeof x === 'string' && /^\d{4}-\d{2}$/.test(x),
  myTiles: validTiles
} as const satisfies Record<SettableKey, Guard>

/**
 * What `settings:save` may change: the SETTABLE keys, the connection (main tests it), onboarding and Pause. Any other
 * key is refused, so a window can't write main's own fields (`apiKeys`, `windowBounds`).
 */
const SAVABLE: Partial<Record<keyof SettingsUpdate, Guard>> = {
  ...SETTABLE,
  apiFormat: oneOf('auto', 'openai', 'anthropic'),
  baseUrl: text(2000),
  model: text(200),
  apiKey: text(2000),
  onboarded: bool,
  workPaused: bool,
  workPausedUntil: checkedLater // cleaned by `cleanPauseEnd` as it's saved
}

const savable: Guard = (x) => record(x) && Object.entries(x as object).every(([k, v]) => Object.hasOwn(SAVABLE, k) && SAVABLE[k as keyof SettingsUpdate]!(v))

/** What `connections:connect` may send (D-54): a built-in's fields, or one of the user's own. Unknown keys are refused. */
export const connectRequest: Guard = (x) => {
  if (!record(x)) return false
  const r = x as Record<string, unknown>
  const only = (allowed: string[]) => Object.keys(r).every((k) => allowed.includes(k))
  const str = (max: number) => (v: unknown) => typeof v === 'string' && v.length <= max
  switch (r.kind) {
    case 'apple':
    case 'google':
      return only(['kind'])
    case 'canvas':
      return only(['kind', 'url', 'token']) && str(2000)(r.url) && str(2000)(r.token)
    case 'notion':
      return only(['kind', 'token']) && str(2000)(r.token)
    case 'mcp':
      return only(['kind', 'name', 'url', 'auth', 'token']) && str(100)(r.name) && str(2000)(r.url) && oneOf('none', 'token', 'oauth')(r.auth) && optional(str(2000))(r.token)
    default:
      return false
  }
}

const CHAT: View[] = ['panel', 'quick']
const PANEL: View[] = ['panel']
const LANGUAGE = oneOf('en', 'zh-HK')

/** Every channel a window may use. The preload's channels must all be here (a rule test checks). */
export const CHANNELS = {
  'settings:get': { views: CHAT, args: [] },
  'settings:save': { views: CHAT, args: [savable] },
  'settings:set': { views: PANEL, args: [oneOf(...Object.keys(SETTABLE)), (x) => x !== undefined] },
  'settings:counts': { views: PANEL, args: [] },
  'settings:test': { views: PANEL, args: [] },
  'permissions:get': { views: PANEL, args: [] },
  'permissions:open': { views: CHAT, args: [oneOf('accessibility', 'screen', 'calendars')] },
  'app:relaunch': { views: PANEL, args: [] },
  'usage:get': { views: PANEL, args: [] },
  'diagnostics:get': { views: PANEL, args: [] },
  'connections:list': { views: CHAT, args: [] },
  'connections:connect': { views: CHAT, args: [connectRequest] },
  'connections:cancel': { views: CHAT, args: [] },
  'connections:tool': { views: PANEL, args: [id, text(200), bool] },
  'connections:recheck': { views: PANEL, args: [id] },
  'connections:sign-in': { views: PANEL, args: [id] },
  'connections:remove': { views: PANEL, args: [id] },
  // D-73: Otty's own calendar. Main checks each field and the ranges (`ipc/calendar.ts`).
  'calendar:range': { views: PANEL, args: [num(0, 8.64e15), num(0, 8.64e15)] },
  'calendar:save': { views: PANEL, args: [checkedLater] },
  'calendar:remove': { views: PANEL, args: [id] },
  // D-77: the Pouch (`ipc/pouch.ts`). Main looks each Pebble up by its answer and place; a shelf name is checked here.
  'pouch:list': { views: PANEL, args: [] },
  'pouch:shelf': { views: PANEL, args: [id, int(0, 100), (x) => cleanShelf(x) !== undefined] },
  'pouch:drop': { views: PANEL, args: [id, int(0, 100)] },
  'pouch:undo-drop': { views: PANEL, args: [id, int(0, 100)] },
  'pouch:forget': { views: PANEL, args: [] },
  'chat:send': { views: CHAT, args: [text(200_000), list(record, 50), optional(record)] },
  'chat:stop': { views: CHAT, args: [] },
  'chat:reset': { views: CHAT, args: [] },
  'chats:list': { views: PANEL, args: [] },
  'chats:open': { views: PANEL, args: [id, optional(id)] },
  'chats:search': { views: PANEL, args: [text(2_000)] },
  'chats:delete': { views: PANEL, args: [id] },
  'chats:clear': { views: PANEL, args: [] },
  'chat:confirm': { views: CHAT, args: [id, bool] },
  'chat:rewind-plan': { views: CHAT, args: [id] },
  'chat:rewind': { views: CHAT, args: [id, list(id, 50), oneOf('retry', 'edit'), optional(oneOf('shorter', 'simpler', 'detail'))] },
  'chat:learn': { views: CHAT, args: [bool] },
  'chat:explain': { views: CHAT, args: [text(500), text(50_000), optional(LANGUAGE)] },
  'steps:run': { views: CHAT, args: [id, int(0, 100), optional(bool)] },
  'steps:tick': { views: CHAT, args: [id, int(0, 100), bool] },
  'steps:check': { views: CHAT, args: [id, int(0, 100)] },
  'steps:stuck': { views: CHAT, args: [id, int(0, 100)] },
  'pebbles:keep': { views: CHAT, args: [id, int(0, 100), bool] },
  'pebbles:kept': { views: CHAT, args: [id] },
  'activity:list': { views: PANEL, args: [] },
  'activity:stop': { views: PANEL, args: [id] },
  'activity:answer': { views: PANEL, args: [id, bool] },
  'activity:retry': { views: PANEL, args: [id] },
  'activity:resume': { views: PANEL, args: [id] },
  'activity:open': { views: PANEL, args: [id] },
  'activity:seen': { views: PANEL, args: [] },
  'logbook:get': { views: PANEL, args: [oneOf('wait', 'next', 'all', 'sent', 'changed', 'noted'), text(200)] },
  'logbook:entry': { views: PANEL, args: [id] },
  'logbook:undo': { views: PANEL, args: [id] },
  'logbook:note': { views: PANEL, args: [id, text(500)] },
  'home:get': { views: PANEL, args: [] },
  'memory:list': { views: PANEL, args: [] },
  'memory:add': { views: PANEL, args: [text(2_000)] },
  'memory:update': { views: PANEL, args: [int(0, Number.MAX_SAFE_INTEGER), record] },
  'memory:remove': { views: PANEL, args: [int(0, Number.MAX_SAFE_INTEGER)] },
  'memory:clear': { views: PANEL, args: [] },
  'chat:undo-receipt': { views: CHAT, args: [id, int(0, 100)] },
  'chat:draft': { views: CHAT, args: [text(20_000), text(40)] },
  'memory:undo': { views: CHAT, args: [id, int(0, Number.MAX_SAFE_INTEGER)] },
  'memory:open': { views: CHAT, args: [] },
  'files:pick': { views: CHAT, args: [] },
  // The bubble too: files dropped on the otter (D-37).
  'files:register': { views: [...CHAT, 'bubble'], args: [checkedLater] },
  'files:read': { views: CHAT, args: [id] },
  'files:discard': { views: CHAT, args: [id] },
  'hidden:show': { views: CHAT, args: [id] },
  'capture:selection': { views: PANEL, args: [] },
  'capture:screenshot': { views: PANEL, args: [] },
  'panel:close': { views: PANEL, args: [] },
  'window:state': { views: PANEL, args: [oneOf('expand', 'shrink')] },
  'window:glide-ready': { views: PANEL, args: [] },
  'shell:open': { views: CHAT, args: [text(8_000)] },
  'clipboard:write': { views: [...CHAT, 'pickup'], args: [text(1_000_000)] },
  'pickup:open': { views: CHAT, args: [text(50_000_000)] },
  'pickup:picture': { views: ['pickup'], args: [] },
  'pickup:read': { views: ['pickup'], args: [] },
  'pickup:close': { views: ['pickup'], args: [] },
  'drawing:export': { views: CHAT, args: [checkedLater, oneOf('copy', 'png', 'pdf')] },
  'drawing:show': { views: CHAT, args: [checkedLater] },
  'viewer:content': { views: ['viewer'], args: [] },
  'viewer:close': { views: ['viewer'], args: [] },
  'quick:close': { views: ['quick'], args: [] },
  'quick:expand': { views: ['quick'], args: [] },
  'quick:resize': { views: ['quick'], args: [num(0, 10_000)] },
  'quick:state': { views: ['quick'], args: [record] },
  'bubble:menu': { views: ['bubble'], args: [] },
  'bubble:drag': { views: ['bubble'], args: [oneOf('start', 'end')] },
  'bubble:feed': { views: ['bubble'], args: [list(id, 5)] },
  'bubble:feed-text': { views: ['bubble'], args: [text(200_000)] }
} as const satisfies Record<string, { views: readonly View[]; args: readonly Guard[] }>

export type Channel = keyof typeof CHANNELS

const views = new WeakMap<WebContents, View>()

/** Called as each window loads its page, so a message can be traced to the view that sent it. */
export function setView(contents: WebContents, view: View): void {
  views.set(contents, view)
}

/** Why a message is refused, or null when it may go ahead. */
export function refusal(channel: Channel, e: Pick<IpcMainEvent, 'sender' | 'senderFrame'>, args: unknown[]): string | null {
  const spec = CHANNELS[channel]
  const view = views.get(e.sender)
  if (!view || !(spec.views as readonly View[]).includes(view)) return `not for the ${view ?? 'unknown'} view`
  if (!e.senderFrame || e.senderFrame !== e.sender.mainFrame) return 'not from the page itself'
  if (args.length > spec.args.length) return 'too many arguments'
  const bad = spec.args.findIndex((guard, i) => !guard(args[i]))
  return bad === -1 ? null : `argument ${bad + 1} doesn't fit`
}

/** `ipcMain.handle`, checked first. A refused message resolves to undefined. */
export function handle(channel: Channel, fn: (e: IpcMainInvokeEvent, ...args: never[]) => unknown): void {
  ipcMain.handle(channel, (e, ...args: unknown[]) => {
    const why = refusal(channel, e, args)
    if (!why) return (fn as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(e, ...args)
    console.warn(`Refused ${channel}: ${why}`)
  })
}

/** `ipcMain.on`, checked first. */
export function on(channel: Channel, fn: (e: IpcMainEvent, ...args: never[]) => unknown): void {
  ipcMain.on(channel, (e, ...args: unknown[]) => {
    const why = refusal(channel, e, args)
    if (!why) (fn as (e: IpcMainEvent, ...a: unknown[]) => unknown)(e, ...args)
    else console.warn(`Refused ${channel}: ${why}`)
  })
}

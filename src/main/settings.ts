import type { PublicSettings, SettingsUpdate, WindowState } from '../shared/types'
import { defaultHomeLanguage } from './language'
import { profileFor } from './providers/profiles'
import { serviceAt, type ServiceId } from '../shared/services'
import { cleanCap } from '../shared/cap'
import { cleanPauseEnd } from '../shared/pauseUntil'
import { HOME_WIDGETS } from '../shared/homeWidgets'
import type { SavedConnection } from './connections/types'

// The settings and the keys, over a small backend (D-45 step 3). The Mac's, in `settingsOnMac.ts`, is plugged in by
// `core.ts`, so this module, and the tool loop that reads it, never import electron.

/** Where secrets are locked. The Mac's is the Keychain, through `safeStorage`; a locked value is base64. */
export interface Keychain {
  available(): boolean
  lock(plain: string): string
  /** Throws when the Keychain won't open it. */
  unlock(locked: string): string
}

export interface SettingsBackend {
  /** The saved settings file's text, or null on first run. */
  read(): string | null
  write(text: string): void
  keychain: Keychain
  /** The Mac's preferred languages, for the first home language. */
  systemLanguages(): string[]
  /** True in the installed app. Development reads `DEEPSEEK_API_KEY` and measures the cache. */
  packaged(): boolean
  /** Launch at login, which macOS owns. Null where it can't be set (development, other systems). */
  loginItem: { get(): boolean; set(on: boolean): void } | null
}

let backend: SettingsBackend | null = null

/** Plugged in once at launch; a test plugs in its own. Settings are read again from it. */
export function setSettingsBackend(b: SettingsBackend): void {
  backend = b
  cache = null
}

function using(): SettingsBackend {
  if (!backend) throw new Error('Settings were read before their backend was plugged in.')
  return backend
}

/** True in development: a build that isn't the installed app. */
export const isDev = (): boolean => !using().packaged()

interface SavedKey {
  /** Base64 of the safeStorage-encrypted key, or, from an Otty before D-51, of the key itself. */
  enc: string
  plain?: boolean
}

export interface StoredSettings extends Omit<PublicSettings, 'hasApiKey' | 'needsKey' | 'savedKeys' | 'readsPages' | 'takenHotkeys' | 'openAtLogin' | 'canOpenAtLogin' | 'keychain'> {
  /** One per service, so a key only ever goes to the service it belongs to. */
  apiKeys?: Partial<Record<ServiceId, SavedKey>>
  /** The single key from before 0.5, moved into `apiKeys` on load. */
  apiKeyEnc?: string
  apiKeyPlain?: boolean
  bubblePosition?: { x: number; y: number }
  /** Where each state of the Otty window was left (D-65). Main's alone: a window can't set it. */
  windowBounds?: Partial<Record<WindowState, { x: number; y: number; width: number; height: number }>>
  /** "Not now" to moving into Applications (D-53), so it's asked once. */
  moveDeclined?: boolean
  /** D-54: connections, each with its secret locked by the Keychain. Main's alone: never public, never settable. */
  connections?: SavedConnection[]
}

const DEFAULTS: Omit<StoredSettings, 'homeLanguage'> = {
  apiFormat: 'auto',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  thinking: false,
  showBubble: true,
  askHotkey: 'Alt+Space',
  snapHotkey: 'Alt+Shift+Space',
  screenHotkey: 'Command+Alt+Shift+Space',
  onboarded: false,
  shareAppContext: true,
  rememberChats: true,
  keepChats: '1y',
  learn: true,
  workPaused: false,
  workPausedUntil: null,
  notifyDone: false,
  monthlyCap: null,
  capNoticed: null,
  homeUsed: false,
  languageSwitch: null,
  myTiles: [],
  homeWidgets: [...HOME_WIDGETS]
}

let cache: StoredSettings | null = null
let takenHotkeys: string[] = []

/** Which shortcuts failed to register, so Settings can say so. */
export function setTakenHotkeys(hotkeys: string[]): void {
  takenHotkeys = hotkeys
}

function load(): StoredSettings {
  if (cache) return cache
  let saved: Partial<StoredSettings> = {}
  try {
    saved = JSON.parse(using().read() ?? '{}')
  } catch {
    /* damaged: start again */
  }
  // Missing means "never chosen", so follow the Mac's languages. A saved null means the user picked "None".
  const homeLanguage = saved.homeLanguage !== undefined ? saved.homeLanguage : defaultHomeLanguage(using().systemLanguages())
  cache = { ...DEFAULTS, ...saved, homeLanguage }
  moveOldKey(cache)
  lockPlainKeys(cache)
  return cache
}

/** A key an older Otty kept in plain text goes into the Keychain as soon as the Keychain works (D-51). */
function lockPlainKeys(s: StoredSettings): void {
  const plain = Object.values(s.apiKeys ?? {}).filter((k) => k.plain)
  const keychain = using().keychain
  if (!plain.length || !keychain.available()) return
  for (const k of plain) {
    k.enc = keychain.lock(Buffer.from(k.enc, 'base64').toString('utf8'))
    delete k.plain
  }
  persist()
}

/** The old key belonged to whichever service the address pointed at. */
function moveOldKey(s: StoredSettings): void {
  if (!s.apiKeyEnc) return
  s.apiKeys = { ...s.apiKeys, [serviceAt(s.baseUrl)]: { enc: s.apiKeyEnc, ...(s.apiKeyPlain ? { plain: true } : {}) } }
  delete s.apiKeyEnc
  delete s.apiKeyPlain
  persist()
}

/** For development only: the installed app takes keys from the Keychain and nowhere else (D-51). */
const envKey = (s: StoredSettings) => (isDev() && serviceAt(s.baseUrl) === 'deepseek' && process.env.DEEPSEEK_API_KEY) || null

function persist(): void {
  using().write(JSON.stringify(cache, null, 2))
}

export function getStored(): StoredSettings {
  return load()
}

export function getPublic(): PublicSettings {
  const s = load()
  const { apiKeys, apiKeyEnc: _e, apiKeyPlain: _p, bubblePosition: _b, moveDeclined: _m, windowBounds: _w, connections: _c, ...rest } = s
  return {
    ...rest,
    hasApiKey: Boolean(apiKeys?.[serviceAt(s.baseUrl)]) || Boolean(envKey(s)),
    needsKey: profileFor(rest.baseUrl, rest.apiFormat).needsKey,
    readsPages: profileFor(rest.baseUrl, rest.apiFormat).web !== 'off',
    takenHotkeys,
    keychain: using().keychain.available(),
    ...loginItem(),
    savedKeys: Object.keys(apiKeys ?? {}) as ServiceId[]
  }
}

export function getApiKey(): string | null {
  const s = load()
  const saved = s.apiKeys?.[serviceAt(s.baseUrl)]
  if (!saved) return envKey(s)
  try {
    return saved.plain ? Buffer.from(saved.enc, 'base64').toString('utf8') : using().keychain.unlock(saved.enc)
  } catch (err) {
    console.error('Could not unlock the saved key', err)
    return null
  }
}

/** Whether Otty opens at login. macOS is the source of truth, so it's read each time rather than saved. */
function loginItem(): { openAtLogin: boolean; canOpenAtLogin: boolean } {
  const item = using().loginItem
  return { canOpenAtLogin: Boolean(item), openAtLogin: Boolean(item?.get()) }
}

export function update(u: SettingsUpdate): PublicSettings {
  const s = load()
  // `keychain` is Otty's to say, never the window's.
  const { apiKey, openAtLogin, monthlyCap, workPausedUntil, keychain: _k, ...rest } = u as SettingsUpdate & { keychain?: unknown }
  // From the renderer, so it's checked: a cap that isn't one is no cap, and an end that isn't one is "until I say".
  if (monthlyCap !== undefined) s.monthlyCap = cleanCap(monthlyCap)
  if (workPausedUntil !== undefined) s.workPausedUntil = cleanPauseEnd(workPausedUntil)
  if (u.workPaused === false) s.workPausedUntil = null
  if (openAtLogin !== undefined) using().loginItem?.set(openAtLogin)
  Object.assign(s, rest)
  if (apiKey !== undefined) {
    const key = apiKey.trim()
    const service = serviceAt(s.baseUrl)
    const keys = (s.apiKeys ??= {})
    // Without the Keychain a key isn't saved at all, never in plain text; `keychain: false` tells the window why.
    if (!key) delete keys[service]
    else if (using().keychain.available()) keys[service] = { enc: using().keychain.lock(key) }
  }
  persist()
  return getPublic()
}

export function saveWindowBounds(state: WindowState, bounds: { x: number; y: number; width: number; height: number }): void {
  const s = load()
  s.windowBounds = { ...s.windowBounds, [state]: bounds }
  persist()
}

export function saveBubblePosition(pos: { x: number; y: number }): void {
  load().bubblePosition = pos
  persist()
}

export function saveMoveDeclined(): void {
  load().moveDeclined = true
  persist()
}

/** The Keychain the settings use, for anything else Otty locks away (a connection's token, D-54). */
export function keychain(): Keychain {
  return using().keychain
}

/** D-54: the saved connections, in the order they were added. */
export function getConnections(): SavedConnection[] {
  return load().connections ?? []
}

export function saveConnections(list: SavedConnection[]): void {
  load().connections = list
  persist()
}

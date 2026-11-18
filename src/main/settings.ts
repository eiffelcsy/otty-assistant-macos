import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { PublicSettings, SettingsUpdate } from '../shared/types'
import { defaultHomeLanguage } from './language'
import { profileFor } from './providers/profiles'
import { serviceAt, type ServiceId } from '../shared/services'
import { cleanCap } from '../shared/cap'
import { cleanPauseEnd } from '../shared/pauseUntil'

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
  /** "Not now" to moving into Applications (D-53), so it's asked once. */
  moveDeclined?: boolean
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
  monthlyCap: null
}

let cache: StoredSettings | null = null
let takenHotkeys: string[] = []

/** Which shortcuts failed to register, so Settings can say so. */
export function setTakenHotkeys(hotkeys: string[]): void {
  takenHotkeys = hotkeys
}

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function load(): StoredSettings {
  if (cache) return cache
  let saved: Partial<StoredSettings> = {}
  try {
    saved = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    /* first run */
  }
  // Missing means "never chosen", so follow the Mac's languages. A saved null means the user picked "None".
  const homeLanguage = saved.homeLanguage !== undefined ? saved.homeLanguage : defaultHomeLanguage(app.getPreferredSystemLanguages())
  cache = { ...DEFAULTS, ...saved, homeLanguage }
  moveOldKey(cache)
  lockPlainKeys(cache)
  return cache
}

/** A key an older Otty kept in plain text goes into the Keychain as soon as the Keychain works (D-51). */
function lockPlainKeys(s: StoredSettings): void {
  const plain = Object.values(s.apiKeys ?? {}).filter((k) => k.plain)
  if (!plain.length || !safeStorage.isEncryptionAvailable()) return
  for (const k of plain) {
    k.enc = safeStorage.encryptString(Buffer.from(k.enc, 'base64').toString('utf8')).toString('base64')
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
const envKey = (s: StoredSettings) => (!app.isPackaged && serviceAt(s.baseUrl) === 'deepseek' && process.env.DEEPSEEK_API_KEY) || null

function persist(): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(cache, null, 2))
}

export function getStored(): StoredSettings {
  return load()
}

export function getPublic(): PublicSettings {
  const s = load()
  const { apiKeys, apiKeyEnc: _e, apiKeyPlain: _p, bubblePosition: _b, moveDeclined: _m, ...rest } = s
  return {
    ...rest,
    hasApiKey: Boolean(apiKeys?.[serviceAt(s.baseUrl)]) || Boolean(envKey(s)),
    needsKey: profileFor(rest.baseUrl, rest.apiFormat).needsKey,
    readsPages: profileFor(rest.baseUrl, rest.apiFormat).web !== 'off',
    takenHotkeys,
    keychain: safeStorage.isEncryptionAvailable(),
    ...loginItem(),
    savedKeys: Object.keys(apiKeys ?? {}) as ServiceId[]
  }
}

export function getApiKey(): string | null {
  const s = load()
  const saved = s.apiKeys?.[serviceAt(s.baseUrl)]
  if (!saved) return envKey(s)
  const buf = Buffer.from(saved.enc, 'base64')
  try {
    return saved.plain ? buf.toString('utf8') : safeStorage.decryptString(buf)
  } catch (err) {
    console.error('Could not unlock the saved key', err)
    return null
  }
}

/** Whether Otty opens at login. macOS is the source of truth, so it's read each time rather than saved. */
function loginItem(): { openAtLogin: boolean; canOpenAtLogin: boolean } {
  const can = process.platform === 'darwin' && app.isPackaged
  return { canOpenAtLogin: can, openAtLogin: can && app.getLoginItemSettings().openAtLogin }
}

export function update(u: SettingsUpdate): PublicSettings {
  const s = load()
  // `keychain` is Otty's to say, never the window's.
  const { apiKey, openAtLogin, monthlyCap, workPausedUntil, keychain: _k, ...rest } = u as SettingsUpdate & { keychain?: unknown }
  // From the renderer, so it's checked: a cap that isn't one is no cap, and an end that isn't one is "until I say".
  if (monthlyCap !== undefined) s.monthlyCap = cleanCap(monthlyCap)
  if (workPausedUntil !== undefined) s.workPausedUntil = cleanPauseEnd(workPausedUntil)
  if (u.workPaused === false) s.workPausedUntil = null
  if (openAtLogin !== undefined && loginItem().canOpenAtLogin) app.setLoginItemSettings({ openAtLogin })
  Object.assign(s, rest)
  if (apiKey !== undefined) {
    const key = apiKey.trim()
    const service = serviceAt(s.baseUrl)
    const keys = (s.apiKeys ??= {})
    // Without the Keychain a key isn't saved at all, never in plain text; `keychain: false` tells the window why.
    if (!key) delete keys[service]
    else if (safeStorage.isEncryptionAvailable()) keys[service] = { enc: safeStorage.encryptString(key).toString('base64') }
  }
  persist()
  return getPublic()
}

export function saveBubblePosition(pos: { x: number; y: number }): void {
  load().bubblePosition = pos
  persist()
}

export function saveMoveDeclined(): void {
  load().moveDeclined = true
  persist()
}

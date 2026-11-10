import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { PublicSettings, SettingsUpdate } from '../shared/types'
import { defaultHomeLanguage } from './language'
import { profileFor } from './providers/profiles'
import { serviceAt, type ServiceId } from '../shared/services'

interface SavedKey {
  /** Base64 of the safeStorage-encrypted key, or of the key itself if encryption wasn't available. */
  enc: string
  plain?: boolean
}

interface StoredSettings extends Omit<PublicSettings, 'hasApiKey' | 'needsKey' | 'savedKeys' | 'readsPages' | 'takenHotkeys' | 'openAtLogin' | 'canOpenAtLogin'> {
  /** One per service, so a key only ever goes to the service it belongs to. */
  apiKeys?: Partial<Record<ServiceId, SavedKey>>
  /** The single key from before 0.5, moved into `apiKeys` on load. */
  apiKeyEnc?: string
  apiKeyPlain?: boolean
  bubblePosition?: { x: number; y: number }
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
  notifyDone: false
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
  return cache
}

/** The old key belonged to whichever service the address pointed at. */
function moveOldKey(s: StoredSettings): void {
  if (!s.apiKeyEnc) return
  s.apiKeys = { ...s.apiKeys, [serviceAt(s.baseUrl)]: { enc: s.apiKeyEnc, ...(s.apiKeyPlain ? { plain: true } : {}) } }
  delete s.apiKeyEnc
  delete s.apiKeyPlain
  persist()
}

const envKey = (s: StoredSettings) => (serviceAt(s.baseUrl) === 'deepseek' && process.env.DEEPSEEK_API_KEY) || null

function persist(): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(cache, null, 2))
}

export function getStored(): StoredSettings {
  return load()
}

export function getPublic(): PublicSettings {
  const s = load()
  const { apiKeys, apiKeyEnc: _e, apiKeyPlain: _p, bubblePosition: _b, ...rest } = s
  return {
    ...rest,
    hasApiKey: Boolean(apiKeys?.[serviceAt(s.baseUrl)]) || Boolean(envKey(s)),
    needsKey: profileFor(rest.baseUrl, rest.apiFormat).needsKey,
    readsPages: profileFor(rest.baseUrl, rest.apiFormat).web !== 'off',
    takenHotkeys,
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
  const { apiKey, openAtLogin, ...rest } = u
  if (openAtLogin !== undefined && loginItem().canOpenAtLogin) app.setLoginItemSettings({ openAtLogin })
  Object.assign(s, rest)
  if (apiKey !== undefined) {
    const key = apiKey.trim()
    const service = serviceAt(s.baseUrl)
    const keys = (s.apiKeys ??= {})
    if (!key) delete keys[service]
    else if (safeStorage.isEncryptionAvailable()) keys[service] = { enc: safeStorage.encryptString(key).toString('base64') }
    else keys[service] = { enc: Buffer.from(key, 'utf8').toString('base64'), plain: true }
  }
  persist()
  return getPublic()
}

export function saveBubblePosition(pos: { x: number; y: number }): void {
  load().bubblePosition = pos
  persist()
}

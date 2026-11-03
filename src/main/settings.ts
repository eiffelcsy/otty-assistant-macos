import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { PublicSettings, SettingsUpdate } from '../shared/types'
import { defaultHomeLanguage } from './language'

interface StoredSettings extends Omit<PublicSettings, 'hasApiKey'> {
  apiKeyEnc?: string // base64 of safeStorage-encrypted key (or plain, if encryption unavailable)
  apiKeyPlain?: boolean
  bubblePosition?: { x: number; y: number }
}

const DEFAULTS: Omit<StoredSettings, 'homeLanguage'> = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  thinking: false,
  showBubble: true,
  askHotkey: 'Alt+Space',
  snapHotkey: 'Alt+Shift+Space',
  onboarded: false,
  shareAppContext: true,
  rememberChats: true,
  keepChats: '1y'
}

let cache: StoredSettings | null = null

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
  return cache
}

function persist(): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(cache, null, 2))
}

export function getStored(): StoredSettings {
  return load()
}

export function getPublic(): PublicSettings {
  const { apiKeyEnc, apiKeyPlain: _p, bubblePosition: _b, ...rest } = load()
  return { ...rest, hasApiKey: Boolean(apiKeyEnc) || Boolean(process.env.DEEPSEEK_API_KEY) }
}

export function getApiKey(): string | null {
  const s = load()
  if (s.apiKeyEnc) {
    const buf = Buffer.from(s.apiKeyEnc, 'base64')
    return s.apiKeyPlain ? buf.toString('utf8') : safeStorage.decryptString(buf)
  }
  return process.env.DEEPSEEK_API_KEY ?? null
}

export function update(u: SettingsUpdate): PublicSettings {
  const s = load()
  const { apiKey, ...rest } = u
  Object.assign(s, rest)
  if (apiKey !== undefined) {
    const key = apiKey.trim()
    if (!key) {
      delete s.apiKeyEnc
    } else if (safeStorage.isEncryptionAvailable()) {
      s.apiKeyEnc = safeStorage.encryptString(key).toString('base64')
      s.apiKeyPlain = false
    } else {
      s.apiKeyEnc = Buffer.from(key, 'utf8').toString('base64')
      s.apiKeyPlain = true
    }
  }
  persist()
  return getPublic()
}

export function saveBubblePosition(pos: { x: number; y: number }): void {
  load().bubblePosition = pos
  persist()
}

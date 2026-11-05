import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let dir = ''
let brokenKeychain = false

vi.mock('electron', () => ({
  app: { getPath: () => dir, getPreferredSystemLanguages: () => ['en-GB'] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`locked:${s}`),
    decryptString: (b: Buffer) => {
      if (brokenKeychain) throw new Error('Keychain says no')
      return b.toString().replace('locked:', '')
    }
  }
}))

const locked = (key: string) => Buffer.from(`locked:${key}`).toString('base64')
const file = () => join(dir, 'settings.json')

/** A fresh copy of the module, as after restarting Otty. */
async function launch(saved?: object) {
  if (saved) writeFileSync(file(), JSON.stringify(saved))
  vi.resetModules()
  return import('../settings')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'otty-settings-'))
  brokenKeychain = false
  vi.unstubAllEnvs()
  vi.stubEnv('DEEPSEEK_API_KEY', '')
})

describe('upgrading from one key', () => {
  it('keeps a DeepSeek user’s key working, with no setup', async () => {
    const s = await launch({ apiKeyEnc: locked('old-key'), baseUrl: 'https://api.deepseek.com', onboarded: true })
    expect(s.getApiKey()).toBe('old-key')
    expect(s.getPublic()).toMatchObject({ hasApiKey: true, savedKeys: ['deepseek'], onboarded: true })
  })

  it('files a custom address’s key under that service', async () => {
    const s = await launch({ apiKeyEnc: locked('their-key'), baseUrl: 'https://models.example.com/v1' })
    expect(s.getApiKey()).toBe('their-key')
    expect(s.getPublic().savedKeys).toEqual(['custom'])
  })

  it('keeps a key that was stored without encryption', async () => {
    const s = await launch({ apiKeyEnc: Buffer.from('plain-key').toString('base64'), apiKeyPlain: true })
    expect(s.getApiKey()).toBe('plain-key')
  })

  it('moves the key for good, and survives a restart', async () => {
    await (await launch({ apiKeyEnc: locked('old-key') })).update({ thinking: true })
    const saved = JSON.parse(readFileSync(file(), 'utf8'))
    expect(saved).not.toHaveProperty('apiKeyEnc')
    expect((await launch()).getApiKey()).toBe('old-key')
  })
})

describe('one key per service', () => {
  it('never hands one service’s key to another', async () => {
    const s = await launch({ apiKeyEnc: locked('deepseek-key') })
    s.update({ baseUrl: 'https://models.example.com/v1' })
    expect(s.getApiKey()).toBeNull()
    expect(s.getPublic().hasApiKey).toBe(false)
    s.update({ baseUrl: 'https://api.anthropic.com' })
    expect(s.getApiKey()).toBeNull()
  })

  it('keeps each key when switching back and forth', async () => {
    const s = await launch()
    s.update({ apiKey: 'deepseek-key' })
    s.update({ baseUrl: 'https://api.anthropic.com', apiKey: 'claude-key' })
    expect(s.getApiKey()).toBe('claude-key')
    s.update({ baseUrl: 'https://api.deepseek.com' })
    expect(s.getApiKey()).toBe('deepseek-key')
    expect(s.getPublic().savedKeys.sort()).toEqual(['claude', 'deepseek'])
  })

  it('clears only the current service’s key', async () => {
    const s = await launch()
    s.update({ apiKey: 'deepseek-key' })
    s.update({ baseUrl: 'https://api.anthropic.com', apiKey: 'claude-key' })
    s.update({ apiKey: '' })
    expect(s.getApiKey()).toBeNull()
    s.update({ baseUrl: 'https://api.deepseek.com' })
    expect(s.getApiKey()).toBe('deepseek-key')
  })

  it('stores keys encrypted, and never shows them to the window', async () => {
    const s = await launch()
    s.update({ apiKey: 'secret-key' })
    expect(readFileSync(file(), 'utf8')).not.toContain('secret-key')
    expect(JSON.stringify(s.getPublic())).not.toContain('secret')
    expect(s.getPublic()).not.toHaveProperty('apiKeys')
  })

  it('treats a key it can’t unlock as missing, instead of crashing', async () => {
    const s = await launch({ apiKeyEnc: locked('old-key') })
    brokenKeychain = true
    expect(s.getApiKey()).toBeNull()
  })
})

describe('the developer key', () => {
  it('only ever applies to DeepSeek', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'dev-key')
    const s = await launch()
    expect(s.getApiKey()).toBe('dev-key')
    expect(s.getPublic().hasApiKey).toBe(true)
    s.update({ baseUrl: 'https://api.anthropic.com' })
    expect(s.getApiKey()).toBeNull()
    expect(s.getPublic().hasApiKey).toBe(false)
  })
})

describe('a new install', () => {
  it('starts on DeepSeek with nothing saved', async () => {
    const s = await launch()
    expect(s.getPublic()).toMatchObject({ baseUrl: 'https://api.deepseek.com', apiFormat: 'auto', hasApiKey: false, needsKey: true, savedKeys: [] })
    expect(existsSync(file())).toBe(false)
  })
})

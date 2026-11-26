import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedConnection } from '../types'

// A settings file in memory, and a fake Keychain whose lock is reversible and visible to the tests.
let file: string | null = null
let available = true
let unlockFails = false

const keychain = {
  available: () => available,
  lock: (s: string) => 'L:' + Buffer.from(s).toString('base64'),
  unlock: (s: string) => {
    if (unlockFails) throw new Error('Keychain says no')
    return Buffer.from(s.replace('L:', ''), 'base64').toString('utf8')
  }
}

async function load() {
  vi.resetModules()
  const settings = await import('../../settings')
  settings.setSettingsBackend({
    read: () => file,
    write: (t) => {
      file = t
    },
    keychain,
    systemLanguages: () => ['en-GB'],
    packaged: () => true,
    loginItem: null
  })
  const store = await import('../store')
  // After a reset, the error class must come from the same module graph as the store.
  const { ConnectionError } = await import('../types')
  return { settings, store, ConnectionError }
}

const conn = (id: string, label = id): SavedConnection => ({ id, kind: 'mcp', label, auth: 'none', added: 1 })

beforeEach(() => {
  file = null
  available = true
  unlockFails = false
})

describe('connections in settings', () => {
  it('replaces one with the same id in place and appends new ones', async () => {
    const { store } = await load()
    store.putConnection(conn('a'))
    store.putConnection(conn('b'))
    store.putConnection(conn('a', 'renamed'))
    store.putConnection(conn('c'))
    expect(store.savedConnections().map((c) => [c.id, c.label])).toEqual([
      ['a', 'renamed'],
      ['b', 'b'],
      ['c', 'c']
    ])
  })

  it('drops one by id', async () => {
    const { store } = await load()
    store.putConnection(conn('a'))
    store.putConnection(conn('b'))
    store.dropConnection('a')
    expect(store.savedConnections().map((c) => c.id)).toEqual(['b'])
    expect(store.savedConnection('a')).toBeUndefined()
  })

  it('locks a secret and unlocks it again, without the plain token in the file', async () => {
    const { store } = await load()
    const locked = store.lockSecret({ token: 'sk-super-secret-token', refresh: 'r-1' })
    store.putConnection({ ...conn('mcp-1'), secret: locked })
    expect(store.unlockSecret(store.savedConnection('mcp-1')!)).toEqual({ token: 'sk-super-secret-token', refresh: 'r-1' })
    expect(file).not.toBeNull()
    expect(file!).not.toContain('sk-super-secret-token')
  })

  it('updates a secret in place', async () => {
    const { store } = await load()
    store.putConnection({ ...conn('mcp-2'), secret: store.lockSecret({ token: 'old' }) })
    store.updateSecret('mcp-2', (s) => ({ ...s, token: 'new' }))
    expect(store.unlockSecret(store.savedConnection('mcp-2')!)).toEqual({ token: 'new' })
  })

  it('treats a connection with no secret as empty', async () => {
    const { store } = await load()
    expect(store.unlockSecret(conn('apple'))).toEqual({})
  })

  it('keeps connections out of the public settings', async () => {
    const { store, settings } = await load()
    store.putConnection(conn('a'))
    expect(settings.getPublic()).not.toHaveProperty('connections')
  })

  it('refuses to lock when the Keychain is unavailable', async () => {
    const { store, ConnectionError } = await load()
    available = false
    expect(() => store.lockSecret({ token: 'x' })).toThrow(ConnectionError)
  })

  it('reports an auth error when the Keychain cannot open a secret', async () => {
    const { store, ConnectionError } = await load()
    const locked = store.lockSecret({ token: 'x' })
    store.putConnection({ ...conn('mcp-3'), secret: locked })
    unlockFails = true
    const err = (() => {
      try {
        store.unlockSecret(store.savedConnection('mcp-3')!)
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(ConnectionError)
    expect((err as InstanceType<typeof ConnectionError>).kind).toBe('auth')
  })

  it('makes ids with the mcp prefix', async () => {
    const { store } = await load()
    expect(store.newOwnId()).toMatch(/^mcp-[0-9a-f]{12}$/)
  })
})

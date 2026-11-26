// D-54: where connections are kept: settings.json, with each secret locked by the Keychain. Only this file locks and unlocks secrets.
import { randomBytes } from 'crypto'
import { getConnections, keychain, saveConnections } from '../settings'
import type { ConnectionKind } from '../../shared/types'
import { ConnectionError, type SavedConnection, type Secret } from './types'

export function savedConnections(): SavedConnection[] {
  return getConnections()
}

export function savedConnection(id: string): SavedConnection | undefined {
  return getConnections().find((c) => c.id === id)
}

export function putConnection(c: SavedConnection): void {
  const list = getConnections()
  const i = list.findIndex((x) => x.id === c.id)
  if (i < 0) list.push(c)
  else list[i] = c
  saveConnections(list)
}

export function dropConnection(id: string): void {
  saveConnections(getConnections().filter((c) => c.id !== id))
}

export function lockSecret(s: Secret): string {
  if (!keychain().available()) throw new ConnectionError('Your Mac’s Keychain isn’t available, so Otty can’t keep the key safely.', 'bad')
  return keychain().lock(JSON.stringify(s))
}

export function unlockSecret(c: SavedConnection): Secret {
  if (!c.secret) return {}
  try {
    return JSON.parse(keychain().unlock(c.secret))
  } catch {
    console.warn('Could not unlock a connection’s key')
    throw new ConnectionError('Otty couldn’t open the saved key. Sign in or paste it again.', 'auth')
  }
}

export function updateSecret(id: string, change: (s: Secret) => Secret): void {
  const c = savedConnection(id)
  if (!c) return
  const secret = change(unlockSecret(c))
  putConnection({ ...c, secret: lockSecret(secret) })
}

export function newOwnId(): string {
  return 'mcp-' + randomBytes(6).toString('hex')
}

/** A sign-in ran out or a token stopped working: Settings says "Needs you" and its tools aren't offered. */
export function markExpired(id: string, expired = true): void {
  const c = savedConnection(id)
  if (!c) return
  if (expired) putConnection({ ...c, expired })
  else {
    const { expired: _old, ...rest } = c
    putConnection(rest)
  }
}

/** The kinds connected and working right now. */
export function connectedKinds(): ReadonlySet<ConnectionKind> {
  return new Set(savedConnections().filter((c) => !c.expired).map((c) => c.kind))
}

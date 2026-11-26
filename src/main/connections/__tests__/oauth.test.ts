import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'
import { catchRedirect, openInBrowser, pkce } from '../oauth'
import { ConnectionError } from '../types'

const kindOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return (e as ConnectionError).kind
  }
  return 'resolved'
}

describe('the loopback catcher', () => {
  it('resolves the code for the right state and closes', async () => {
    const c = await catchRedirect({ state: 'good' })
    const res = await fetch(`${c.redirectUri}?state=good&code=abc`)
    expect(res.status).toBe(200)
    expect(await c.code).toBe('abc')
  })

  it('refuses a wrong state with a 400 and keeps waiting', async () => {
    const c = await catchRedirect({ state: 'right', timeoutMs: 5000 })
    const bad = await fetch(`${c.redirectUri}?state=wrong&code=evil`)
    expect(bad.status).toBe(400)
    await fetch(`${c.redirectUri}?state=right&code=ok`)
    expect(await c.code).toBe('ok')
  })

  it('rejects as cancelled when the browser says access was denied', async () => {
    const c = await catchRedirect({ state: 's' })
    await fetch(`${c.redirectUri}?state=s&error=access_denied`)
    expect(await kindOf(c.code)).toBe('cancelled')
  })

  it('rejects as cancelled when aborted', async () => {
    const ctrl = new AbortController()
    const c = await catchRedirect({ state: 's', signal: ctrl.signal })
    ctrl.abort()
    expect(await kindOf(c.code)).toBe('cancelled')
  })

  it('rejects as an auth failure when it times out', async () => {
    const c = await catchRedirect({ state: 's', timeoutMs: 50 })
    expect(await kindOf(c.code)).toBe('auth')
  })
})

describe('sign-in helpers', () => {
  it('makes a PKCE challenge that is the SHA-256 of the verifier', () => {
    const { verifier, challenge } = pkce()
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })

  it('refuses to open anything but http or https', async () => {
    await expect(openInBrowser('file:///etc/passwd')).rejects.toBeInstanceOf(ConnectionError)
  })
})

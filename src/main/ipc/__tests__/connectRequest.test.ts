// D-54: what a window may send to connect. Anything outside these shapes is refused before main sees it.
import { describe, expect, it } from 'vitest'
import { connectRequest } from '../check'

describe('connectRequest', () => {
  it('accepts each built-in and the own connection as the form sends it', () => {
    expect(connectRequest({ kind: 'apple' })).toBe(true)
    expect(connectRequest({ kind: 'google' })).toBe(true)
    expect(connectRequest({ kind: 'canvas', url: 'canvas.nus.edu.sg', token: 'x' })).toBe(true)
    expect(connectRequest({ kind: 'notion', token: 'ntn_x' })).toBe(true)
    expect(connectRequest({ kind: 'mcp', name: 'Linear', url: 'https://mcp.linear.app/mcp', auth: 'oauth' })).toBe(true)
    expect(connectRequest({ kind: 'mcp', name: 'Linear', url: 'https://x', auth: 'token', token: 't' })).toBe(true)
  })

  it('refuses unknown keys, unknown kinds and over-long fields', () => {
    expect(connectRequest({ kind: 'apple', extra: 1 })).toBe(false)
    expect(connectRequest({ kind: 'canvas', url: 'a', token: 'b', apiKey: 'c' })).toBe(false)
    expect(connectRequest({ kind: 'dropbox' })).toBe(false)
    expect(connectRequest({ kind: 'notion', token: 'x'.repeat(2001) })).toBe(false)
    expect(connectRequest({ kind: 'mcp', name: 'n'.repeat(101), url: 'https://x', auth: 'none' })).toBe(false)
    expect(connectRequest({ kind: 'mcp', name: 'n', url: 'https://x', auth: 'basic' })).toBe(false)
    expect(connectRequest(null)).toBe(false)
  })
})

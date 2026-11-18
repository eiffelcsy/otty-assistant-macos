// CLAUDE.md "Model services live behind…" (D-52): every request leaves through `send` in `net.ts`, the one door out,
// so `web: 'off'` holds whatever a new call site forgets.
import { describe, expect, it } from 'vitest'
import { findIn, read, sourceFiles, withoutComments } from './source'

const MAIN = sourceFiles('src/main').filter((f) => f !== 'src/main/net.ts')

describe('CLAUDE.md "Model services live behind…": one door out', () => {
  it('calls fetch nowhere in main but net.ts', () => {
    expect(MAIN.flatMap((f) => findIn(f, /(?<![\w.])fetch\(|=\s*fetch\b(?!Impl)/g))).toEqual([])
  })

  it('opens no sockets of its own: no http, https or undici in main', () => {
    expect(MAIN.flatMap((f) => findIn(f, /from '(node:)?(https?|undici)'/g))).toEqual([])
  })

  it('gives every Anthropic client the door', () => {
    const code = withoutComments(read('src/main/providers/anthropic.ts'))
    const clients = [...code.matchAll(/new Anthropic\(\{[^}]*\}\)/g)].map((m) => m[0])
    expect(clients.length).toBeGreaterThan(0)
    expect(clients.filter((c) => !c.includes('fetch: send'))).toEqual([])
  })

  it('plugs the local-only check in once, at the root', () => {
    expect(withoutComments(read('src/main/core.ts'))).toMatch(/setLocalOnly\(\(\) => activeProfile\(\)\.web === 'off'\)/)
  })
})

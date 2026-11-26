// CLAUDE.md "Model services live behind…" (D-52): every request leaves through `send` in `net.ts`, the one door out,
// so `web: 'off'` holds whatever a new call site forgets.
import { describe, expect, it } from 'vitest'
import { findIn, read, sourceFiles, withoutComments } from './source'

const MAIN = sourceFiles('src/main').filter((f) => f !== 'src/main/net.ts')

describe('CLAUDE.md "Model services live behind…": one door out', () => {
  it('calls fetch nowhere in main but net.ts', () => {
    expect(MAIN.flatMap((f) => findIn(f, /(?<![\w.])fetch\(|=\s*fetch\b(?!Impl)/g))).toEqual([])
  })

  // D-54: the sign-in catcher listens on 127.0.0.1 for the browser's redirect. It accepts a connection, never makes one.
  const CATCHER = 'src/main/connections/oauth.ts'

  it('opens no sockets of its own: no http, https or undici in main', () => {
    expect(MAIN.filter((f) => f !== CATCHER).flatMap((f) => findIn(f, /from '(node:)?(https?|undici)'/g))).toEqual([])
  })

  it('lets the sign-in catcher only listen, and only on this Mac', () => {
    const code = withoutComments(read(CATCHER))
    expect(code).toMatch(/import \{ createServer[^}]*\} from '(node:)?http'/)
    expect([...code.matchAll(/\.listen\(([^)]*)\)/g)].map((m) => m[1])).toEqual([expect.stringContaining("'127.0.0.1'")])
  })

  // D-54: the MCP SDK, bundled, makes main require ajv at runtime (not shipped) and drags main into the file reader.
  it('imports no MCP SDK in main: connections use their own client', () => {
    expect(MAIN.filter((f) => !f.includes('__tests__')).flatMap((f) => findIn(f, /@modelcontextprotocol\/sdk/g))).toEqual([])
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

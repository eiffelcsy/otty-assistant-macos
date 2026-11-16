// CLAUDE.md "The main process owns the conversation history…": the API key never reaches the renderer.
// CLAUDE.md "Attachments": the renderer only gets ids, names and thumbnails, never paths or file contents.
// The preload is the renderer's only door (lint keeps electron and main out of the renderer), so it is checked here.
import { describe, expect, it } from 'vitest'
import { read, withoutComments } from './source'

const PRELOAD = withoutComments(read('src/preload/index.ts'))
const TYPES = withoutComments(read('src/shared/types.ts'))

/** The body of `export interface Name { … }` in shared/types.ts. */
function iface(name: string): string {
  const start = TYPES.indexOf(`export interface ${name} `)
  expect(start, `shared/types.ts has no interface ${name}`).toBeGreaterThan(-1)
  return TYPES.slice(start, TYPES.indexOf('\n}\n', start))
}

describe('CLAUDE.md: the preload hands the renderer no path, key or file contents', () => {
  it('imports only electron and types', () => {
    const imports = [...PRELOAD.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^']+)'/gm)].map((m) => (m[1] ? `type ${m[2]}` : m[2]))
    expect(imports.filter((i) => i !== 'electron' && !i.startsWith('type '))).toEqual([])
    expect(PRELOAD).not.toMatch(/\brequire\(|process\.env|\bfs\b/)
  })

  it('exposes one object, window.otty, typed as OttyApi', () => {
    expect([...PRELOAD.matchAll(/exposeInMainWorld\(/g)]).toHaveLength(1)
    expect(PRELOAD).toMatch(/exposeInMainWorld\('otty', api\)/)
    expect(PRELOAD).toMatch(/const api: OttyApi = \{/)
  })

  it('turns a dropped file into a path only on its way to main', () => {
    const uses = PRELOAD.split('\n').filter((l) => l.includes('getPathForFile'))
    expect(uses.length).toBeGreaterThan(0)
    for (const line of uses) expect(line).toMatch(/ipcRenderer\.invoke\('files:register',/)
  })

  it('returns no path, key, secret or contents field in any shared type', () => {
    // Reviewed: hasApiKey/needsKey are yes-or-no; *Hotkey are shortcuts; tokens is a usage count. SettingsUpdate.apiKey goes the other
    // way, from the Settings field to main, and is never returned.
    const OK = new Set(['hasApiKey', 'needsKey', 'savedKeys', 'askHotkey', 'snapHotkey', 'screenHotkey', 'takenHotkeys', 'tokens'])
    const fields = [...TYPES.matchAll(/^\s+(?:readonly\s+)?(\w*(?:[Pp]ath|[Kk]ey|[Ss]ecret|[Tt]oken|[Cc]ontents?|[Pp]assword)\w*)\??:/gm)].map((m) => m[1])
    expect(fields.filter((f) => f === 'apiKey')).toHaveLength(1)
    expect(iface('SettingsUpdate')).toMatch(/\n\s+apiKey\?: string/)
    expect(fields.filter((f) => !OK.has(f) && f !== 'apiKey')).toEqual([])
  })

  it('gives the renderer files as ids and names only', () => {
    expect(iface('PendingFile').replace(/\s+/g, ' ')).toMatch(/\{ id: string name: string\s*$/)
    expect(iface('FileAttachment')).not.toMatch(/\b(path|text|content|data)\??:/)
  })
})

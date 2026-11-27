// The local smoke run sized to a change (affected.mjs): every spec it names exists, and a file nobody mapped is
// checked by everything, never by nothing.
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- a plain .mjs script, untyped
import { AREAS, CORE, affected } from '../affected.mjs'

const specs = join(__dirname, '../specs')

describe('affected smoke specs', () => {
  it('names only specs that exist, and every spec is reachable from some area or the core', () => {
    const named = new Set<string>([...CORE, ...(AREAS as [string[], string[]][]).flatMap(([, n]) => n)])
    for (const n of named) expect(existsSync(join(specs, `${n}.smoke.ts`)), n).toBe(true)
    const all = readdirSync(specs).filter((f) => f.endsWith('.smoke.ts')).map((f) => f.replace('.smoke.ts', ''))
    expect(all.filter((n) => !named.has(n))).toEqual([])
  })

  it('runs an area’s specs plus the core for a file in that area', () => {
    expect(affected(['src/renderer/src/calendar/Week.tsx'])).toEqual([...CORE, 'calendar', 'home', 'connections'])
  })

  it('runs everything for shared code, an unmapped app file, or the harness', () => {
    expect(affected(['src/main/llm.ts'])).toBe('all')
    expect(affected(['src/main/brandNew.ts'])).toBe('all')
    expect(affected(['tools/smoke/fixtures.ts'])).toBe('all')
  })

  it('runs nothing for docs and unit tests, and a changed spec runs itself', () => {
    expect(affected(['docs/CHANGELOG.md', 'src/main/__tests__/llm.test.ts'])).toEqual([])
    expect(affected(['tools/smoke/specs/pouch.smoke.ts'])).toEqual([...CORE, 'pouch'])
  })
})

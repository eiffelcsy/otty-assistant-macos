// CLAUDE.md "Chats are saved as threads…": the schema is in store/db.ts, and once released a migration is
// changed with a new migration, never by editing one.
//
// migrations.json holds a SHA-256 of each released migration's SQL. New migrations may be added freely; add
// their hash here once they're released (merged to main), never change an existing line.
import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'
import { read } from './source'
import released from './migrations.json'

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r' }

/** The MIGRATIONS array from db.ts: its template literals as the program sees them (escapes applied). */
function migrations(): string[] {
  const src = read('src/main/store/db.ts')
  const start = src.indexOf('const MIGRATIONS: string[] = [')
  expect(start, 'store/db.ts no longer declares `const MIGRATIONS: string[] = [`').toBeGreaterThan(-1)
  const open = src.indexOf('[', src.indexOf('=', start))
  const close = src.indexOf('\n]\n', open)
  const body = src.slice(open + 1, close + 1)
  expect(body, 'a migration must be plain SQL, with no ${…}').not.toMatch(/\$\{/)
  const out: string[] = []
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '/' && body[i + 1] === '/') i = body.indexOf('\n', i)
    else if (body[i] === '`') {
      let s = ''
      for (i++; body[i] !== '`'; i++) s += body[i] === '\\' ? (ESCAPES[body[++i]] ?? body[i]) : body[i]
      out.push(s)
    } else expect(body[i], 'MIGRATIONS should hold only template literals and comments').toMatch(/[\s,]/)
  }
  return out
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

describe('CLAUDE.md: a released migration is never edited', () => {
  const now = migrations()
  const hashes = released as Record<string, string>

  it('keeps every released migration, in order', () => {
    expect(now.length).toBeGreaterThanOrEqual(Object.keys(hashes).length)
  })

  for (const [version, hash] of Object.entries(hashes)) {
    it(`leaves ${version} exactly as released`, () => {
      const index = Number(version.slice(1)) - 1
      expect(sha(now[index] ?? ''), `${version} in src/main/store/db.ts changed. Undo the edit and add a new migration instead.`).toBe(hash)
    })
  }
})

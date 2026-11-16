// D-48: every CLAUDE.md bullet has a row in docs/RULES.md saying what enforces it, or "prose only" and why.
// A row starts with the bullet's handle: its words before the first `:(,.;—`, if that's five words or fewer,
// otherwise its first four words (backticks and bold left out).
import { readdirSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'
import { ROOT, read } from './source'

export function handle(bullet: string): string {
  const text = bullet.replace(/[`*]/g, '').trim()
  const lead = text.match(/^([^:(,.;—]+)[:(,.;—]/)?.[1].trim().split(/\s+/)
  return lead && lead.length <= 5 ? lead.join(' ') : text.split(/\s+/).slice(0, 4).join(' ')
}

const bullets = read('CLAUDE.md')
  .split('\n')
  .filter((l) => l.startsWith('- '))
  .map((l) => handle(l.slice(2)))

const rows = read('docs/RULES.md')
  .split('\n')
  .filter((l) => l.startsWith('| ') && !l.startsWith('| Rule |') && !l.startsWith('| ---'))
  .map((l) => l.split(' | ').map((c) => c.replace(/^\|\s*|\s*\|$/g, '').trim()))
  .map(([rule, by]) => ({ rule, by: by ?? '' }))

/** Every test-like file in the repo, by its name, so a row can cite `jobs.test.ts` without a path. */
function testFiles(): Map<string, string[]> {
  const byName = new Map<string, string[]>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'out', 'out-smoke', 'dist', 'build', '.git', 'results', 'report'].includes(e.name)) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.(test|smoke|contract)\.tsx?$|\.mjs$/.test(e.name) || e.name === 'fixtures.ts') {
        byName.set(e.name, [...(byName.get(e.name) ?? []), relative(ROOT, full)])
      }
    }
  }
  walk(join(ROOT, 'src'))
  walk(join(ROOT, 'tools'))
  return byName
}

const curly = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"')

describe('D-48: docs/RULES.md covers every CLAUDE.md rule', () => {
  it('finds the bullets, each with its own handle', () => {
    expect(bullets.length).toBeGreaterThan(30)
    expect(new Set(bullets).size).toBe(bullets.length)
  })

  it('has a row for every bullet, in CLAUDE.md order', () => {
    const missing = bullets.filter((b) => !rows.some((r) => r.rule === b))
    expect(missing, 'Add a row to docs/RULES.md starting with this handle').toEqual([])
    expect(rows.map((r) => r.rule).filter((r) => bullets.includes(r))).toEqual(bullets)
  })

  it('has no row for a bullet that is gone', () => {
    expect(rows.map((r) => r.rule).filter((r) => !bullets.includes(r))).toEqual([])
  })

  it('says what enforces each rule, or "prose only" with a reason', () => {
    const empty = rows.filter((r) => r.by.length < 12 || /^prose only\.?$/i.test(r.by))
    expect(empty.map((r) => r.rule)).toEqual([])
  })

  it('cites only test files that exist, and test names that are in them', () => {
    const files = testFiles()
    const all = [...files.values()].flat()
    const sources = all.map((f) => curly(read(f)))
    const problems: string[] = []
    for (const { rule, by } of rows) {
      for (const [, name] of by.matchAll(/`([\w.-]+\.(?:test|smoke|contract)\.tsx?|[\w.-]+\.mjs)`/g)) {
        if (!files.has(name)) problems.push(`${rule}: no file ${name}`)
      }
      for (const [, quoted] of by.matchAll(/"([^"]{6,})"/g)) {
        const words = curly(quoted).replace(/…$/, '')
        if (!sources.some((s) => s.includes(words))) problems.push(`${rule}: no test named "${quoted}"`)
      }
    }
    expect(problems).toEqual([])
  })
})

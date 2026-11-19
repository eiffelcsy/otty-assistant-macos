// D-48: the docs agents read first can't point at things that aren't there. Paths in CLAUDE.md and DEVLOG's
// architecture exist, and every roadmap row has its entry and every entry its row.
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { read, ROOT } from './source'

/** Names in backticks that aren't files in the repo, each with why. */
const NOT_FILES = new Set([
  'otty.db', // made at runtime, in userData
  'userData/otty.db',
  'fileWorker.js', // the build's name for src/main/files/worker.ts
  '*.smoke.ts', // a pattern
  'clipboard.read/readText/write/writeText', // Electron's API
  'out/', // build output: CI runs the tests before it builds
  'build/bin'
])

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)

/** A path resolves from the root, or as the tail of a tracked path (CLAUDE.md often names `store/db.ts`). */
function resolves(name: string): boolean {
  const p = name.replace(/\/$/, '')
  return existsSync(join(ROOT, p)) || tracked.some((f) => f.endsWith(`/${p}`) || f.includes(`/${p}/`) || f.startsWith(`${p}/`))
}

function pathsIn(text: string): string[] {
  const names = [...text.matchAll(/`([^`\s]+)`/g)].map((m) => m[1])
  return [...new Set(names)].filter((n) => n.includes('/') || /\.(tsx?|m?js|json|css|ya?ml|py|md|mts|db)$/.test(n))
}

const devlog = read('docs/DEVLOG.md')

describe('docs drift', () => {
  it('every path CLAUDE.md names exists', () => {
    const missing = pathsIn(read('CLAUDE.md')).filter((p) => !NOT_FILES.has(p) && !resolves(p))
    expect(missing, 'CLAUDE.md names these, but they are gone: fix the doc, or the move').toEqual([])
  })

  it('every path in DEVLOG’s architecture exists', () => {
    const architecture = devlog.slice(devlog.indexOf('## Architecture'), devlog.indexOf('## Roadmap'))
    const missing = pathsIn(architecture).filter((p) => !NOT_FILES.has(p) && !resolves(p))
    expect(missing).toEqual([])
  })

  it('every roadmap row has an entry, and every entry a row', () => {
    const rows = [...devlog.matchAll(/^\| (D-\d+) \|/gm)].map((m) => m[1])
    const entries = [...devlog.matchAll(/^## (D-\d+) ·/gm)].map((m) => m[1])
    expect(rows.filter((id) => !entries.includes(id)), 'a roadmap row with no entry').toEqual([])
    expect(entries.filter((id) => !rows.includes(id)), 'an entry with no roadmap row: shipped ones move to CHANGELOG').toEqual([])
  })

  it('nothing shipped is still planned: an ID in a CHANGELOG heading has no DEVLOG entry', () => {
    const headings = read('docs/CHANGELOG.md').match(/^###? .*$/gm) ?? []
    const shipped = new Set(headings.flatMap((h) => h.match(/\bD-\d+\b(?! steps)/g) ?? []))
    const entries = [...devlog.matchAll(/^## (D-\d+) ·/gm)].map((m) => m[1])
    // D-48 ships in phases, so its entry stays until the last one.
    expect(entries.filter((id) => shipped.has(id) && id !== 'D-48')).toEqual([])
  })

  // Sizes are effort (the amount and complexity of the work, DEVLOG's scale), never time.
  it('every Size and Effort is on the effort scale, with no days, weeks or hours', () => {
    const TIME = /\b\d*\s*-?\s*(half[- ])?(days?|weeks?|hours?|hrs?|sprints?|afternoons?|evenings?)\b/i
    const bad: string[] = []
    for (const file of ['docs/DEVLOG.md', 'docs/BRAINSTORM.md', 'docs/LAUNCH_READINESS.md', 'docs/AUTONOMY.md', 'docs/UX_REVIEW.md']) {
      let column = -1
      for (const line of read(file).split('\n')) {
        if (!line.startsWith('|')) {
          column = -1
          continue
        }
        const cells = line.split('|').slice(1, -1).map((c) => c.trim())
        if (column < 0) {
          column = cells.findIndex((c) => c === 'Size' || c === 'Effort')
          continue
        }
        const cell = cells[column]
        if (cell === undefined || /^-+$/.test(cell)) continue
        if (!/^(S|M|L|S–M|M–L|ongoing|—)(\s|\(|$)/.test(cell) || TIME.test(cell)) bad.push(`${file}: ${cell}`)
      }
    }
    expect(bad, 'a size that is a time, or not S, M or L').toEqual([])
  })

  it('no plan gives a time estimate, such as "(2 days)" or "a 1-day check"', () => {
    const ESTIMATE = /\b[SML](–[ML])?\s*\([^)]*\b\d+(–\d+)?\s*(days?|weeks?|hours?)\b|\b(\d+(–\d+)?|one|two|three|half)[- ](day|week|hour)\s+(\w+\s+)?(check|spike|task|job|build|effort)\b/i
    const files = ['docs/DEVLOG.md', 'docs/BRAINSTORM.md', 'docs/LAUNCH_READINESS.md', 'docs/AUTONOMY.md', 'docs/UX_REVIEW.md', 'docs/DESIGN.md']
    const specs = tracked.filter((f) => f.startsWith('docs/design/specs/') && f.endsWith('.md'))
    const hits = [...files, ...specs].flatMap((f) =>
      read(f)
        .split('\n')
        .filter((l) => ESTIMATE.test(l))
        .map((l) => `${f}: ${l.slice(0, 80)}`)
    )
    expect(hits).toEqual([])
  })
})

#!/usr/bin/env node
// D-48 verify kit: coverage floors that only go up.
//
//   node tools/verify/coverage.mjs           check coverage/coverage-summary.json against the floors
//   node tools/verify/coverage.mjs --raise   lift the floors to today's numbers; never lowers one
//
// Groups and files come from `coverage` in verify.config.mjs: a group is a folder prefix, a file is held on its own
// (the safety modules). Floors are line and branch percentages, rounded down to one decimal so noise can't fail them.
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, relative, resolve } from 'path'

const root = resolve(import.meta.dirname, '../..')
const BASELINE = join(root, 'tools/verify/baseline/coverage.json')
const SUMMARY = join(root, 'coverage/coverage-summary.json')
const raise = process.argv.includes('--raise')

const { default: config } = await import(join(root, 'verify.config.mjs'))
const { groups = [], files = [] } = config.coverage ?? {}

if (!existsSync(SUMMARY)) {
  console.error('No coverage summary. Run `npm run coverage` (vitest with --coverage) first.')
  process.exit(2)
}
const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'))
const rows = Object.entries(summary)
  .filter(([f]) => f !== 'total')
  .map(([f, v]) => [relative(root, f), v])

const pct = (covered, total) => (total ? Math.floor((1000 * covered) / total) / 10 : 100)
const measure = (picked) => {
  const sum = (k) => picked.reduce((a, [, v]) => ({ c: a.c + v[k].covered, t: a.t + v[k].total }), { c: 0, t: 0 })
  const l = sum('lines')
  const b = sum('branches')
  return { lines: pct(l.c, l.t), branches: pct(b.c, b.t) }
}

const now = {}
for (const g of groups) now[g] = measure(rows.filter(([f]) => f.startsWith(g)))
for (const f of files) {
  const row = rows.find(([r]) => r === f)
  if (!row) {
    console.error(`${f} is held to a floor but has no coverage at all. Is it tested, or was it moved?`)
    process.exit(1)
  }
  now[f] = measure([row])
}

const floors = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
const under = []
for (const [key, got] of Object.entries(now)) {
  for (const k of ['lines', 'branches']) {
    const floor = floors[key]?.[k] ?? 0
    if (got[k] < floor) under.push(`${key}: ${k} ${got[k]}% is under its floor of ${floor}%`)
  }
}

if (raise) {
  const next = {}
  for (const [key, got] of Object.entries(now)) {
    next[key] = {
      lines: Math.max(got.lines, floors[key]?.lines ?? 0),
      branches: Math.max(got.branches, floors[key]?.branches ?? 0)
    }
  }
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`)
  console.log('Coverage floors raised to today’s numbers (none lowered).')
}

if (under.length) {
  console.error(`Coverage went down:\n  ${under.join('\n  ')}\nAdd tests for what changed. Floors only go up.`)
  process.exit(1)
}
const raisable = Object.entries(now).filter(([key, got]) => got.lines > (floors[key]?.lines ?? 0) + 1)
if (!raise && raisable.length) console.log(`Coverage is up in ${raisable.map(([k]) => k).join(', ')}: \`--raise\` lifts the floors.`)
console.log('Coverage holds its floors.')

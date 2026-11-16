#!/usr/bin/env node
// D-48 verify kit: type-aware lint with a baseline that may only shrink.
//
//   node tools/verify/lint.mjs            the whole repo; fails on any finding not in the baseline
//   node tools/verify/lint.mjs a.ts b.ts  only these files (the after-edit hook)
//   node tools/verify/lint.mjs --shrink   lower the baseline to what's left; it never goes up
//   node tools/verify/lint.mjs --init     write the first baseline (refuses if one exists)
//
// The baseline counts findings per file and rule, so moving code doesn't break it but a new finding does.
// Raising it is never done by this script: a finding someone wants to keep gets an inline disable with a reason.
import { spawnSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

const root = resolve(import.meta.dirname, '../..')
const BASELINE = join(root, 'tools/verify/baseline/lint.json')
const args = process.argv.slice(2)
const shrink = args.includes('--shrink')
const init = args.includes('--init')
const files = args.filter((a) => !a.startsWith('--')).map((f) => relative(root, resolve(f)))

const lintable = (f) => /\.(m?[jt]sx?|cjs)$/.test(f)
if (files.length && !files.some(lintable)) process.exit(0)

const bin = join(root, 'node_modules/.bin/oxlint')
const run = spawnSync(bin, ['--type-aware', '-f', 'json', ...(files.length ? files.filter(lintable) : ['.'])], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024
})
let diagnostics
try {
  diagnostics = JSON.parse(run.stdout).diagnostics
} catch {
  console.error(`oxlint didn't run:\n${run.stderr || run.stdout}`)
  process.exit(2)
}

const keyOf = (d) => `${d.filename}::${d.code}`
const counts = {}
for (const d of diagnostics) counts[keyOf(d)] = (counts[keyOf(d)] ?? 0) + 1

if (init) {
  if (existsSync(BASELINE)) {
    console.error('A baseline already exists. It may only shrink: use --shrink.')
    process.exit(1)
  }
  mkdirSync(dirname(BASELINE), { recursive: true })
  writeFileSync(BASELINE, `${JSON.stringify(sorted(counts), null, 2)}\n`)
  console.log(`Baseline written: ${diagnostics.length} findings.`)
  process.exit(0)
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
const inScope = (key) => !files.length || files.includes(key.split('::')[0])

// A key is over when it has more findings than the baseline allows. All of that key's findings are shown,
// because which one is new can't be told apart from the counts.
const over = Object.keys(counts).filter((k) => counts[k] > (baseline[k] ?? 0))
const shrinkable = Object.keys(baseline).filter((k) => inScope(k) && (counts[k] ?? 0) < baseline[k])

if (shrink) {
  if (files.length) {
    console.error('--shrink works on the whole repo only.')
    process.exit(2)
  }
  const next = {}
  for (const [k, n] of Object.entries(baseline)) {
    const now = Math.min(n, counts[k] ?? 0)
    if (now > 0) next[k] = now
  }
  writeFileSync(BASELINE, `${JSON.stringify(sorted(next), null, 2)}\n`)
  console.log(`Baseline shrunk to ${Object.values(next).reduce((a, b) => a + b, 0)} findings.`)
}

if (over.length) {
  console.error('New lint findings (fix them, or disable one inline with a reason):\n')
  for (const d of diagnostics.filter((d) => over.includes(keyOf(d)))) {
    const at = d.labels?.[0]?.span
    console.error(`  ${d.filename}:${at?.line ?? '?'}:${at?.column ?? '?'}  ${d.code}  ${d.message}`)
    if (d.help) console.error(`      ${d.help}`)
  }
  const allowed = over.map((k) => `${k} (baseline ${baseline[k] ?? 0}, now ${counts[k]})`)
  console.error(`\n${allowed.join('\n')}`)
  process.exit(1)
}

if (!shrink && shrinkable.length) {
  console.log(`Lint is clean against the baseline, and ${shrinkable.length} entr${shrinkable.length === 1 ? 'y' : 'ies'} can shrink: run \`node tools/verify/lint.mjs --shrink\`.`)
} else if (!shrink) console.log('Lint is clean against the baseline.')

function sorted(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
}

#!/usr/bin/env node
// D-48 verify kit: the one answer to "am I done?". Generic: everything project-specific is in verify.config.mjs.
//
//   node tools/verify/verify.mjs [tier]     run a tier (default: the config's `defaultTier`)
//   node tools/verify/verify.mjs --routes   only say which extra checks this change needs
//
// Every step of the tier runs, so one failure doesn't hide another, and the summary lists them all.
// Then the routes look at what changed since the base branch and say what else applies.
import { execSync, spawnSync } from 'child_process'
import { matchesGlob, resolve } from 'path'
import { pathToFileURL } from 'url'

const root = resolve(import.meta.dirname, '../..')
const config = (await import(pathToFileURL(resolve(root, 'verify.config.mjs')).href)).default
const args = process.argv.slice(2)
const routesOnly = args.includes('--routes')
const tierName = args.find((a) => !a.startsWith('--')) ?? config.defaultTier
const tier = config.tiers[tierName]
if (!routesOnly && !tier) {
  console.error(`No tier "${tierName}". Tiers: ${Object.keys(config.tiers).join(', ')}`)
  process.exit(2)
}

/** Files changed against the base branch, committed or not. */
function changedFiles() {
  const git = (cmd) => {
    try {
      return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
  const base = git(`merge-base HEAD ${config.base}`)[0]
  return [...new Set([...(base ? git(`diff --name-only ${base}`) : []), ...git('ls-files --others --exclude-standard')])]
}

const results = []
if (!routesOnly) {
  for (const [name, command] of tier) {
    const started = Date.now()
    process.stdout.write(`\n▶ ${name}: ${command}\n`)
    const run = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '0' } })
    results.push({ name, ok: run.status === 0, seconds: Math.round((Date.now() - started) / 100) / 10 })
  }
}

const changed = changedFiles()
const notes = config.routes
  .filter((r) => changed.some((f) => r.when.some((g) => matchesGlob(f, g)) && !(r.unless ?? []).some((g) => matchesGlob(f, g))))
  .filter((r) => !r.unlessChanged || !changed.some((f) => r.unlessChanged.some((g) => matchesGlob(f, g))))

console.log('\n── verify ──')
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name} (${r.seconds}s)`)
if (notes.length) {
  console.log(`\nThis change also needs (${changed.length} files changed since ${config.base}):`)
  for (const n of notes) console.log(`• ${n.say}`)
}
const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.log(`\n${failed.length} failed: ${failed.map((r) => r.name).join(', ')}`)
  process.exit(1)
}

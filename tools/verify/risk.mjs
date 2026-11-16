#!/usr/bin/env node
// D-48 verify kit: the risk class of a change, from the paths it touches. Generic: the paths are in verify.config.mjs.
//
//   node tools/verify/risk.mjs          print the class and the files that set it
//   node tools/verify/risk.mjs --json   the same, for machines: { class, files, changed }
//
// Classes, riskiest first: guarded, normal, low. A file in `guarded` is guarded even when a `low` glob also matches
// it, a file in neither is normal, and a change takes the class of its riskiest file. No changed files is low.
// Guarded never auto-merges, and the class decides whether the ship skill runs /security-review.
import { execSync } from 'child_process'
import { matchesGlob, resolve } from 'path'
import { pathToFileURL } from 'url'

export const CLASSES = ['low', 'normal', 'guarded']

/** The class of one file under `risk` = { guarded: [globs], low: [globs] }. */
export function classOf(file, risk = {}) {
  if ((risk.guarded ?? []).some((g) => matchesGlob(file, g))) return 'guarded'
  if ((risk.low ?? []).some((g) => matchesGlob(file, g))) return 'low'
  return 'normal'
}

/** The class of a change and the files that set it (every file of that class, sorted). */
export function classify(files, risk = {}) {
  const byFile = files.map((file) => ({ file, cls: classOf(file, risk) }))
  const rank = Math.max(0, ...byFile.map((f) => CLASSES.indexOf(f.cls)))
  const cls = CLASSES[rank]
  return { class: cls, files: byFile.filter((f) => f.cls === cls).map((f) => f.file).sort() }
}

/** Files changed against `base`, committed or not, plus untracked ones (the same as verify.mjs). */
export function changedFiles(root, base) {
  const git = (cmd) => {
    try {
      return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
  const mergeBase = git(`merge-base HEAD ${base}`)[0]
  return [...new Set([...(mergeBase ? git(`diff --name-only ${mergeBase}`) : []), ...git('ls-files --others --exclude-standard')])]
}

async function main() {
  const root = resolve(import.meta.dirname, '../..')
  const config = (await import(pathToFileURL(resolve(root, 'verify.config.mjs')).href)).default
  if (!config.risk) {
    console.error('verify.config.mjs has no `risk` section ({ guarded: [globs], low: [globs] }).')
    process.exit(2)
  }
  const changed = changedFiles(root, config.base)
  const result = classify(changed, config.risk)
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...result, changed: changed.length }))
    return
  }
  console.log(`Risk: ${result.class} (${changed.length} files changed since ${config.base})`)
  if (result.files.length) console.log('Set by:')
  for (const f of result.files) console.log(`• ${f}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()

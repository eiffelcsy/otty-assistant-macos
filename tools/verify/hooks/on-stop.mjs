#!/usr/bin/env node
// D-48 verify kit, Claude Code Stop / SubagentStop hook: before an agent says it's done, run the quick tier.
// Red → exit 2 with the failures, so the agent keeps working on them. It only runs when files changed since the
// last commit, and it lets the agent stop on its second try (`stop_hook_active`), so a check it can't fix never traps it.
import { execSync, spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(import.meta.dirname, '../../..')
let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  /* run anyway */
}
if (input.stop_hook_active) process.exit(0)

let dirty = ''
try {
  dirty = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).trim()
} catch {
  process.exit(0)
}
// Only code and config are checked; a docs-only change needs no tests.
if (!dirty.split('\n').some((l) => /\.(m?[jt]sx?|cjs|json|css|html)$/.test(l.trim()))) process.exit(0)

const run = spawnSync(process.execPath, [resolve(root, 'tools/verify/verify.mjs'), 'quick'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
if (run.status === 0) process.exit(0)
const tail = `${run.stdout}\n${run.stderr}`.trim().split('\n').slice(-60).join('\n')
process.stderr.write(`verify:quick is red, so this isn't done yet. Fix it (or say plainly why it can't be fixed):\n\n${tail}\n`)
process.exit(2)

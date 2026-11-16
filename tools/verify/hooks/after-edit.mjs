#!/usr/bin/env node
// D-48 verify kit, Claude Code PostToolUse hook (Edit|Write|MultiEdit): lint the file just edited, against the baseline.
// Exit 2 hands the findings back to the agent, which fixes them before moving on. Anything else stays silent.
import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import { relative, resolve } from 'path'

const root = resolve(import.meta.dirname, '../../..')
let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  process.exit(0)
}
const file = input.tool_input?.file_path
if (!file || !/\.(m?[jt]sx?|cjs)$/.test(file)) process.exit(0)
const rel = relative(root, resolve(file))
if (rel.startsWith('..') || /^(out|out-smoke|dist|node_modules)\//.test(rel)) process.exit(0)

const run = spawnSync(process.execPath, [resolve(root, 'tools/verify/lint.mjs'), rel], { cwd: root, encoding: 'utf8' })
if (run.status === 1) {
  process.stderr.write(`${run.stderr}\n`)
  process.exit(2)
}
process.exit(0)

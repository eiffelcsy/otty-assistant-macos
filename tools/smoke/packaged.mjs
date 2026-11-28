#!/usr/bin/env node
// D-47 step 3 (LAUNCH_READINESS 7.8): the packaged app starts. Run after `npm run build:mac`.
// The smoke harness tests out/ with the dev Electron; this catches what only packaging can break: asar, fuses,
// a missing runtime dependency, the helper path. It needs no hook in the app: Chromium's own switches give the run
// a fresh home (--user-data-dir) and a mock keychain, and "started" means main opened otty.db, which it does
// right after app-ready. Then it must still be alive a few seconds later.
import { spawn } from 'child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '../..')
const START_TIMEOUT = 45_000
const STAY_UP = 4_000

const dirs = [process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'mac-universal'].map((d) => join(root, 'dist', d, 'Otty.app'))
const appPath = process.argv[2] ? resolve(process.argv[2]) : dirs.find(existsSync)
if (!appPath || !existsSync(appPath)) {
  console.error(`No packaged Otty.app for ${process.arch} in dist/. Run \`npm run build:mac\` first, or pass the .app's path.`)
  process.exit(2)
}
const binary = join(appPath, 'Contents/MacOS', readdirSync(join(appPath, 'Contents/MacOS'))[0])
const home = mkdtempSync(join(tmpdir(), 'otty-packaged-'))

// Only what the app needs from the environment: no API keys reach it.
const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'TMPDIR'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))
const child = spawn(binary, [`--user-data-dir=${home}`, '--use-mock-keychain'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', (d) => (output += d))
child.stderr.on('data', (d) => (output += d))
let exited = null
child.on('exit', (code, signal) => (exited = { code, signal }))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const started = Date.now()
let ok = false
while (Date.now() - started < START_TIMEOUT && !exited) {
  if (existsSync(join(home, 'otty.db'))) {
    ok = true
    break
  }
  await wait(250)
}
if (ok) await wait(STAY_UP)
const alive = !exited
child.kill('SIGTERM')
// `killed` only says a signal was sent. An app holding its quit (D-53's "Move to Applications?" opens on this run,
// from dist/) would keep the check waiting forever, so it gets SIGKILL once a few seconds pass without an exit.
for (let i = 0; i < 20 && child.exitCode === null && child.signalCode === null; i++) await wait(250)
if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
// Helper processes can still be writing into the profile just after the kill (ENOTEMPTY), so retry.
rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })

const problems = []
if (!ok) problems.push(exited ? `it exited during startup (${JSON.stringify(exited)})` : `it didn't open its database within ${START_TIMEOUT / 1000}s`)
if (ok && !alive) problems.push(`it exited soon after starting (${JSON.stringify(exited)})`)
if (/Uncaught|Error: Cannot find module|A JavaScript error occurred/i.test(output)) problems.push('it logged a startup error')

if (problems.length) {
  console.error(`The packaged app (${appPath}) failed to start: ${problems.join('; ')}.\n\n${output.slice(-4000)}`)
  process.exit(1)
}
console.log(`The packaged app started, opened its database in ${Math.round((Date.now() - started - STAY_UP) / 100) / 10}s and stayed up.`)

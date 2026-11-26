#!/usr/bin/env node
// D-47: `npm run smoke [-- playwright args]`. Builds, then runs the smoke specs, holding a machine-wide lock throughout.
// Smoke runs share the real clipboard, window focus and the out/ folder, so two at once (two agents, or an agent and
// CI on one Mac) would break each other. The lock makes them take turns; a lock left by a dead process is taken over.
import { spawnSync } from 'child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '../..')
const lock = join(tmpdir(), 'otty-smoke.lock')
const args = process.argv.slice(2)
const skipBuild = args[0] === '--no-build'
if (skipBuild) args.shift()

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function acquire() {
  let told = false
  for (;;) {
    try {
      mkdirSync(lock)
      writeFileSync(join(lock, 'pid'), String(process.pid))
      return
    } catch {
      const holder = Number(readFileSync(join(lock, 'pid'), 'utf8').trim() || 0)
      if (holder && !alive(holder)) {
        rmSync(lock, { recursive: true, force: true })
        continue
      }
      if (!told) console.log(`Another smoke run (pid ${holder || '?'}) is going; waiting for it…`)
      told = true
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

const release = () => rmSync(lock, { recursive: true, force: true })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => (release(), process.exit(130)))

await acquire()
let status = 0
try {
  if (!skipBuild) {
    const build = spawnSync('npm', ['run', 'build:smoke', '--silent'], {
      cwd: root,
      stdio: 'inherit',
      // D-54: a fake Google client, so Sign in with Google runs against the world. Never a real one.
      env: { ...process.env, MAIN_VITE_GOOGLE_CLIENT_ID: 'smoke-google-client', MAIN_VITE_GOOGLE_CLIENT_SECRET: 'smoke-google-secret' }
    })
    if (build.status !== 0) throw new Error('build:smoke failed')
  }
  const run = spawnSync('npx', ['playwright', 'test', '-c', 'tools/smoke/playwright.config.ts', ...args], { cwd: root, stdio: 'inherit' })
  status = run.status ?? 1
} catch (err) {
  console.error(String(err))
  status = 1
} finally {
  release()
}
process.exit(status)

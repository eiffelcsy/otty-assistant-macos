// The screenshots CI took on this branch's last run, copied over the baselines. CI's Mac is the reference, because
// another macOS draws Chinese text a little differently. Then commit them in a PR of their own that says why (D-48).
//   node tools/ui-preview/screens/from-ci.mjs
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
const run = gh('run', 'list', '--branch', branch, '--workflow', 'ci', '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId')
const dir = mkdtempSync(join(tmpdir(), 'screens-'))
gh('run', 'download', run, '-n', 'screens-diff', '-D', dir)
const baseline = new URL('./baseline/', import.meta.url).pathname
for (const sub of readdirSync(dir)) {
  for (const f of readdirSync(join(dir, sub)).filter((n) => n.endsWith('-actual.png'))) {
    copyFileSync(join(dir, sub, f), join(baseline, f.replace('-actual', '')))
    console.log('updated', f.replace('-actual', ''))
  }
}

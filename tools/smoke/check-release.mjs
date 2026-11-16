// D-47: the release build must contain no smoke code. Run after `npm run build`; exits non-zero with what it found.
// The smoke entry is built apart, into out-smoke/, and only loads out/; this proves nothing of it leaked into out/.
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'

const root = resolve(import.meta.dirname, '../..')
const out = join(root, 'out')
const MARKERS = ['__ottySmoke', 'OTTY_SMOKE', 'use-mock-keychain', 'Smoke run refused']

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'ui-preview') yield* files(path) // the UI preview is a dev tool built into out/, never packaged
    } else yield path
  }
}

const found = []
for (const path of files(out)) {
  const rel = relative(root, path)
  if (/smoke/i.test(rel)) found.push(`${rel}: a smoke file in the release build`)
  if (!/\.(js|mjs|cjs|html|json)$/.test(path)) continue
  const text = readFileSync(path, 'utf8')
  for (const marker of MARKERS) if (text.includes(marker)) found.push(`${rel}: contains "${marker}"`)
}

if (found.length) {
  console.error(`The release build contains smoke code:\n${found.map((f) => `  ${f}`).join('\n')}`)
  process.exit(1)
}
console.log('Release build is free of smoke code.')

#!/usr/bin/env node
// D-87: the update feeds Squirrel.Mac reads (src/main/update.ts), one per arch, in its static JSON format, pointing at
// the zips of this tag's release.   node tools/release/feed.mjs v0.7.0   → dist/update-arm64.json, dist/update-x64.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const tag = process.argv[2]
if (!/^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(tag ?? '')) throw new Error(`Give the release tag, like v0.7.0 (got ${tag})`)
const version = tag.slice(1)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
if (pkg.version !== version) throw new Error(`package.json says ${pkg.version}, but the tag is ${tag}`)

for (const arch of ['arm64', 'x64']) {
  const zip = `Otty-${version}-${arch}.zip`
  if (!existsSync(`dist/${zip}`)) throw new Error(`dist/${zip} is missing`)
  const url = `https://github.com/eiffelcsy/otty-assistant-macos/releases/download/${tag}/${zip}`
  const updateTo = { version, name: version, notes: '', pub_date: new Date().toISOString(), url }
  writeFileSync(`dist/update-${arch}.json`, JSON.stringify({ currentRelease: version, releases: [{ version, updateTo }] }, null, 2) + '\n')
  console.log(`dist/update-${arch}.json → ${zip}`)
}

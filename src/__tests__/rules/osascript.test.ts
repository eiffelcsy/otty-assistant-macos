// CLAUDE.md "Step cards…": anything from the model goes to `osascript` through argv, never into a script's text.
// Statically: in src/main, no AppleScript line is built with ${…} or +, except the reviewed cases below, which
// only splice in values from fixed tables in our own code.
import { describe, expect, it } from 'vitest'
import { findIn, read, sourceFiles, withoutComments } from './source'

const MAIN = sourceFiles('src/main')
const callsOsascript = MAIN.filter((f) => read(f).includes("'osascript'"))

/** Words that only show up in AppleScript text. */
const APPLESCRIPT = /\b(tell application|keystroke|key code|using \{|make new|do shell script|set \w+ to|on run|activate|click )/

/** Reviewed splices: each takes values from a fixed table, never from the model or the page. */
const REVIEWED: { file: string; text: string; why: string }[] = [
  {
    file: 'src/main/capture.ts',
    text: '`tell application id "${bundle}" to return ${expr}`',
    why: 'bundle must be a key of the fixed BROWSERS table and expr is its value (`if (!expr) return` above)'
  },
  {
    file: 'src/main/act/index.ts',
    text: '`using {${shortcut.modifiers.join(\', \')}}`',
    why: 'modifiers come only from the MODIFIERS table in act/keys.ts; parseCombo returns null for anything else'
  },
  {
    file: 'src/main/act/index.ts',
    text: '`key code ${shortcut.key} ${using}`',
    why: 'a number from KEY_CODES; a typed key goes as `keystroke (item 2 of argv)`'
  },
  {
    file: 'src/main/act/index.ts',
    text: '`keystroke (item 2 of argv) ${using}`',
    why: 'the key itself is argv; only the fixed modifiers are spliced'
  },
  {
    file: 'src/main/act/index.ts',
    text: '`tell application "System Events" to ${key}`',
    why: '`key` is one of the two reviewed lines above'
  }
]

const templates = (code: string) => [...code.matchAll(/`(?:\\[\s\S]|[^`\\])*`/g)].map((m) => m[0])

describe('CLAUDE.md: model text reaches osascript only through argv', () => {
  it('finds the files that run osascript', () => {
    expect(callsOsascript.length).toBeGreaterThan(0)
  })

  it('builds no AppleScript line with ${…}, outside the reviewed splices', () => {
    const found = callsOsascript.flatMap((file) =>
      templates(withoutComments(read(file)))
        .filter((t) => t.includes('${') && APPLESCRIPT.test(t))
        .filter((t) => !REVIEWED.some((r) => r.file === file && r.text === t))
        .map((t) => `${file}  ${t}`)
    )
    expect(found, 'Pass model text as argv (`on run argv` … `item 1 of argv`), never inside the script').toEqual([])
  })

  it('keeps every reviewed splice where it was, so the list never goes stale', () => {
    const stale = REVIEWED.filter((r) => !templates(withoutComments(read(r.file))).includes(r.text))
    expect(stale.map((r) => `${r.file}  ${r.text}`)).toEqual([])
  })

  it('concatenates nothing onto an AppleScript line', () => {
    const found = callsOsascript.flatMap((file) => findIn(file, /(['"])[^'"\n]*(tell application|keystroke|make new|set \w+ to)[^'"\n]*\1\s*\+/g))
    expect(found).toEqual([])
  })

  it('never runs AppleScript `do shell script`, and never starts a shell', () => {
    const found = MAIN.flatMap((file) => [
      ...findIn(file, /do shell script/g),
      ...findIn(file, /shell:\s*true/g),
      ...findIn(file, /import\s*\{[^}]*\b(exec|execSync|spawnSync)\b[^}]*\}\s*from\s*'(node:)?child_process'/g)
    ])
    expect(found).toEqual([])
  })
})

// CLAUDE.md "What left the Mac (D-31)": `activeProvider(sent)` needs a `SentTag` saying why.
// CLAUDE.md "Explain terms…": background calls (explain cards, titles) use `complete()` with `reasoning: 'least'`
// and never touch ChatSession history.
import { describe, expect, it } from 'vitest'
import { lineAt, read, sourceFiles, withoutComments } from './source'

const MAIN = sourceFiles('src/main')

/** Each `activeProvider(…)` call, or a chat session's `deps.provider(…)` (D-45): where, its argument, and what follows. */
function calls() {
  return MAIN.flatMap((file) => {
    const code = withoutComments(read(file))
    return [...code.matchAll(/(?<!function )\b(?:activeProvider|deps\.provider)\(([^)]*)\)/g)].map((m) => ({
      at: `${file}:${lineAt(code, m.index)}`,
      arg: m[1].trim(),
      after: code.slice(m.index, m.index + 400)
    }))
  })
}

describe('CLAUDE.md "What left the Mac": every request says why it went', () => {
  it('passes a SentTag to every activeProvider call', () => {
    const all = calls()
    expect(all.length).toBeGreaterThan(0)
    expect(all.filter((c) => !c.arg).map((c) => c.at)).toEqual([])
  })

  it('keeps the SentTag parameter required', () => {
    expect(read('src/main/providers/index.ts')).toMatch(/export function activeProvider\(sent: SentTag\)/)
  })

  it('records searches and pages where they go out', () => {
    expect(withoutComments(read('src/main/tools/web.ts'))).toMatch(/\brecord\(\{/)
    expect(withoutComments(read('src/main/loop.ts'))).toMatch(/record\(\{ kind: 'search'/)
  })
})

describe('CLAUDE.md "Explain terms…": background calls use complete() and the least thinking', () => {
  it('sends titles and explain cards with complete(), reasoning least, outside the chat', () => {
    const background = calls().filter((c) => /kind: '(title|explain)'/.test(c.arg))
    expect(background.map((c) => c.arg.match(/kind: '(\w+)'/)?.[1]).sort((a = '', b = '') => a.localeCompare(b))).toEqual(['explain', 'title'])
    for (const c of background) {
      expect(c.after, c.at).toMatch(/^(?:activeProvider|deps\.provider)\([^)]*\)\.complete\(\{/)
      const request = c.after.slice(c.after.indexOf('.complete('), c.after.indexOf('})', c.after.indexOf('.complete(')))
      expect(request, c.at).toMatch(/reasoning: 'least'/)
      expect(c.after, c.at).not.toMatch(/this\.history|\.history\.push/)
    }
  })
})

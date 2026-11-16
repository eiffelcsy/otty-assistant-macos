// D-47: the smoke-test checklist in DEVLOG stays the source of truth. Every step is checked by a spec tagged
// `@step-N`, marked ✋ with a reason for what a person must check, or both; and no spec names a step that doesn't exist.
import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')
const devlog = readFileSync(join(root, 'docs/DEVLOG.md'), 'utf8')
const checklist = devlog.slice(devlog.indexOf('## Smoke-test checklist'))
const steps = new Map([...checklist.matchAll(/^(\d+)\. (.*)$/gm)].map((m) => [Number(m[1]), m[2]]))

const specsDir = join(root, 'tools/smoke/specs')
const tags = new Map<number, string[]>()
for (const file of readdirSync(specsDir).filter((f) => f.endsWith('.smoke.ts'))) {
  for (const m of readFileSync(join(specsDir, file), 'utf8').matchAll(/@step-(\d+)/g)) {
    const n = Number(m[1])
    tags.set(n, [...(tags.get(n) ?? []), file])
  }
}

describe('the smoke checklist and the smoke specs agree', () => {
  it('finds the checklist, numbered 1 to N with no gaps', () => {
    const numbers = [...steps.keys()]
    expect(numbers.length).toBeGreaterThan(100)
    expect(numbers).toEqual(numbers.map((_n, i) => i + 1))
  })

  it('checks every step with a spec, or marks it ✋ with a reason', () => {
    const neither = [...steps].filter(([n, text]) => !tags.has(n) && !/✋ \S/.test(text)).map(([n]) => n)
    expect(neither, 'tag a spec with @step-N, or add "✋ <why a person must check it>" to the step').toEqual([])
  })

  it('tags only steps that exist', () => {
    const unknown = [...tags.keys()].filter((n) => !steps.has(n))
    expect(unknown, 'a spec names a checklist step that isn’t there').toEqual([])
  })
})

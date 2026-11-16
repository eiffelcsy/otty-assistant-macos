import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs kit script, no types
import { classify, classOf } from '../risk.mjs'
// @ts-expect-error plain .mjs config, no types
import config from '../../../verify.config.mjs'

const risk = { guarded: ['src/main/act/**', 'src/main/web.ts', 'tools/verify/**'], low: ['docs/**', '**/__tests__/**', 'tools/**', '**/*.md'] }

describe('classOf', () => {
  it('puts a file in neither list in normal', () => {
    expect(classOf('src/main/llm.ts', risk)).toBe('normal')
  })
  it('matches low globs, including top-level markdown', () => {
    expect(classOf('docs/DEVLOG.md', risk)).toBe('low')
    expect(classOf('README.md', risk)).toBe('low')
    expect(classOf('src/main/__tests__/llm.test.ts', risk)).toBe('low')
    expect(classOf('tools/eval/compare.mjs', risk)).toBe('low')
  })
  it('lets guarded win over low', () => {
    expect(classOf('tools/verify/lint.mjs', risk)).toBe('guarded')
    expect(classOf('src/main/act/__tests__/risk.test.ts', risk)).toBe('guarded')
  })
  it('treats a missing section as all normal', () => {
    expect(classOf('docs/a.md')).toBe('normal')
  })
})

describe('classify', () => {
  it('takes the class of the riskiest file and lists the files that set it', () => {
    expect(classify(['docs/DEVLOG.md', 'src/main/web.ts', 'src/main/llm.ts', 'src/main/act/open.ts'], risk)).toEqual({
      class: 'guarded',
      files: ['src/main/act/open.ts', 'src/main/web.ts']
    })
    expect(classify(['docs/DEVLOG.md', 'src/main/llm.ts'], risk)).toEqual({ class: 'normal', files: ['src/main/llm.ts'] })
    expect(classify(['docs/DEVLOG.md', 'README.md'], risk)).toEqual({ class: 'low', files: ['README.md', 'docs/DEVLOG.md'] })
  })
  it('calls an empty change low', () => {
    expect(classify([], risk)).toEqual({ class: 'low', files: [] })
  })
})

describe("Otty's risk config", () => {
  const cases: [string, string][] = [
    ['src/main/toolSafety.ts', 'guarded'],
    ['src/main/act/risk.ts', 'guarded'],
    ['src/main/pageReader.ts', 'guarded'],
    ['src/shared/secrets.ts', 'guarded'],
    ['src/main/memory/guard.ts', 'guarded'],
    ['src/main/store/db.ts', 'guarded'],
    ['src/preload/index.ts', 'guarded'],
    ['csp.config.ts', 'guarded'],
    ['src/main/prompts.ts', 'guarded'],
    ['tools/verify/risk.mjs', 'guarded'],
    ['tools/smoke/app/main.ts', 'guarded'],
    ['.claude/settings.json', 'guarded'],
    ['.github/workflows/ci.yml', 'guarded'],
    ['src/main/llm.ts', 'normal'],
    ['src/renderer/src/panel/Markdown.tsx', 'normal'],
    ['tools/smoke/specs/launch.smoke.ts', 'low'],
    ['src/main/__tests__/llm.test.ts', 'low'],
    ['docs/BRAINSTORM.md', 'low'],
    ['CLAUDE.md', 'low']
  ]
  it.each(cases)('%s is %s', (file, cls) => {
    expect(classOf(file, config.risk)).toBe(cls)
  })
})

// Smaller CLAUDE.md rules about what loads where, checked by reading the source.
import { describe, expect, it } from 'vitest'
import { findIn, read, sourceFiles, withoutComments } from './source'

const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string>; scripts?: Record<string, string> }

describe('CLAUDE.md "Electron 45 no longer downloads its binary": the postinstall stays', () => {
  it('runs install-electron after npm install', () => {
    expect(pkg.scripts?.postinstall).toBe('install-electron')
  })
})

describe('CLAUDE.md "The tool loop is src/main/loop.ts": the loop needs no electron', () => {
  it('imports nothing from electron in loop.ts or the job runner', () => {
    const found = ['src/main/loop.ts', 'src/main/jobs/runner.ts'].flatMap((f) => findIn(f, /from\s+'electron'/g))
    expect(found).toEqual([])
  })
})

describe('CLAUDE.md "Attachments": documents are read in the worker, and secrets never leave it', () => {
  it('loads pdfjs-dist and mammoth only with import(), and ships them as runtime dependencies', () => {
    const found = sourceFiles('src').flatMap((f) => findIn(f, /^\s*import\b[^(]*from\s+'(pdfjs-dist|mammoth)[^']*'/gm))
    expect(found).toEqual([])
    expect(Object.keys(pkg.dependencies ?? {}).sort((a, b) => a.localeCompare(b))).toEqual(['mammoth', 'pdfjs-dist'])
  })

  it('masks every text the worker reads', () => {
    const extract = withoutComments(read('src/main/files/extract.ts'))
    expect(extract).toMatch(/import \{[^}]*\bmaskSecrets\b[^}]*\} from '..\/..\/shared\/secrets'/)
    expect(extract).toMatch(/maskSecrets\(decodeText\(/)
  })
})

describe('CLAUDE.md "Math": shared/math.ts stays free of mathjs, which main loads lazily', () => {
  it('imports mathjs nowhere but main/math.ts, and only with import() (types are erased)', () => {
    const found = sourceFiles('src').flatMap((f) => findIn(f, /^\s*import\s+(?!type\b)[^(]*from\s+'mathjs'/gm))
    expect(found).toEqual([])
    const lazy = sourceFiles('src').filter((f) => /import\(\s*'mathjs'\s*\)/.test(withoutComments(read(f))))
    expect(lazy).toEqual(['src/main/math.ts'])
  })
})

describe('CLAUDE.md "Pick up text": Chinese stays first in the OCR helper', () => {
  it('asks Apple Vision for Chinese before English', () => {
    expect(read('tools/otty-ocr/main.swift')).toMatch(/reader\(\["zh-Hant", "zh-Hans",/)
  })
})

describe('CLAUDE.md "Smoke harness": src/ has no test hooks', () => {
  it('never mentions the smoke harness in app code', () => {
    const found = sourceFiles('src').flatMap((f) => findIn(f, /smoke|OTTY_TEST|__TEST__/gi))
    expect(found).toEqual([])
  })
})

describe('CLAUDE.md "Web safety": Claude’s web_fetch stays off', () => {
  it('never names web_fetch in app code', () => {
    const found = sourceFiles('src/main').flatMap((f) => findIn(f, /web_fetch/g))
    expect(found).toEqual([])
  })
})

// Helpers for the rule tests (D-48): they read source files, they never import app code.
import { readdirSync, readFileSync } from 'fs'
import { join, relative, resolve } from 'path'

export const ROOT = resolve(import.meta.dirname, '../../..')

export const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

/** Every file under `dir` (repo-relative) whose name matches `ext`, leaving out tests. */
export function sourceFiles(dir: string, ext = /\.(ts|tsx)$/): string[] {
  const out: string[] = []
  const walk = (abs: string) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const full = join(abs, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full)
      } else if (ext.test(entry.name) && !/\.(test|smoke)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(relative(ROOT, full))
      }
    }
  }
  walk(join(ROOT, dir))
  return out.sort()
}

/** Blanks out comments (keeping line numbers), so a rule isn't tripped by prose that explains it. */
export function withoutComments(src: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (c === quote) quote = null
      i++
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      out += src.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
    } else if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      out += ' '.repeat(stop - i)
      i = stop
    } else {
      if (c === '"' || c === "'" || c === '`') quote = c
      out += c
      i++
    }
  }
  return out
}

/** 1-based line number of an index in a text. */
export const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length

/** `file:line  snippet` for each match of `re` (global) in a file's code, comments left out. */
export function findIn(file: string, re: RegExp, code = withoutComments(read(file))): string[] {
  return [...code.matchAll(re)].map((m) => `${file}:${lineAt(code, m.index)}  ${m[0].trim().slice(0, 100)}`)
}

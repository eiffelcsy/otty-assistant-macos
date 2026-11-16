// CLAUDE.md "Jobs (src/main/jobs/)": the truth is in JobStore, and only JobRunner changes a job's status.
// Statically: only runner.ts writes job changes through the store, and only the stores hold SQL that writes jobs.
import { describe, expect, it } from 'vitest'
import { findIn, sourceFiles } from './source'

const MAIN = sourceFiles('src/main')
const RUNNER = 'src/main/jobs/runner.ts'
const STORES = 'src/main/jobs/stores.ts'

describe('CLAUDE.md "Jobs": only JobRunner changes a job', () => {
  it('uses JobChange only in the runner, the stores and their types', () => {
    const found = MAIN.filter((f) => ![RUNNER, STORES, 'src/main/jobs/types.ts'].includes(f)).flatMap((f) => findIn(f, /\bJobChange\b/g))
    expect(found).toEqual([])
  })

  it('writes the jobs table only from the stores', () => {
    const found = MAIN.filter((f) => f !== STORES).flatMap((f) => findIn(f, /\b(update|insert into|delete from)\s+jobs\b/gi))
    expect(found).toEqual([])
  })

  it('builds a job store only in jobs/index.ts, which hands it to the runner', () => {
    const found = MAIN.filter((f) => f !== 'src/main/jobs/index.ts').flatMap((f) => findIn(f, /new (Sqlite|Memory)JobStore\b/g))
    expect(found).toEqual([])
  })
})

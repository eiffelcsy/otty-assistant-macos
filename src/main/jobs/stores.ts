import type { DatabaseSync } from 'node:sqlite'
import type { Message } from '../providers'
import { compact } from '../store/db'
import { stripHistory } from '../store/images'
import type { Job, JobChange, JobStatus, JobStore } from './types'

const FINISHED: JobStatus[] = ['done', 'failed']

interface Row {
  id: string
  title: string
  brief: string
  status: JobStatus
  seed_urls: string
  denied_urls: string
  source_thread: string | null
  result_thread: string | null
  language: Job['language']
  rounds: number
  lookups: number
  worked_ms: number
  wait_url: string | null
  error: string | null
  partial: number
  due_at: number | null
  ran_late: number
  created_at: number
  updated_at: number
  seen_at: number | null
}

const toJob = (r: Row): Job => ({
  id: r.id,
  title: r.title,
  brief: r.brief,
  status: r.status,
  seedUrls: JSON.parse(r.seed_urls),
  denied: JSON.parse(r.denied_urls),
  ...(r.source_thread ? { sourceThread: r.source_thread } : {}),
  ...(r.result_thread ? { resultThread: r.result_thread } : {}),
  language: r.language,
  rounds: r.rounds,
  lookups: r.lookups,
  workedMs: r.worked_ms,
  ...(r.wait_url ? { waitUrl: r.wait_url } : {}),
  ...(r.error ? { error: r.error } : {}),
  partial: Boolean(r.partial),
  ...(r.due_at ? { dueAt: r.due_at } : {}),
  ...(r.ran_late ? { ranLate: true } : {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.seen_at ? { seenAt: r.seen_at } : {})
})

const COLUMNS: Record<string, string> = {
  title: 'title',
  status: 'status',
  sourceThread: 'source_thread',
  resultThread: 'result_thread',
  rounds: 'rounds',
  lookups: 'lookups',
  workedMs: 'worked_ms',
  waitUrl: 'wait_url',
  error: 'error',
  updatedAt: 'updated_at',
  seenAt: 'seen_at',
  dueAt: 'due_at'
}

export class SqliteJobStore implements JobStore {
  constructor(private db: DatabaseSync) {}

  async list(): Promise<Job[]> {
    return (this.db.prepare('select * from jobs order by created_at, rowid').all() as unknown as Row[]).map(toJob)
  }

  async get(id: string): Promise<Job | undefined> {
    const row = this.db.prepare('select * from jobs where id = ?').get(id) as Row | undefined
    return row && toJob(row)
  }

  async add(j: Job): Promise<void> {
    this.db
      .prepare(
        `insert into jobs(id, title, brief, status, seed_urls, denied_urls, source_thread, language, due_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(j.id, j.title, j.brief, j.status, JSON.stringify(j.seedUrls), JSON.stringify(j.denied), j.sourceThread ?? null, j.language, j.dueAt ?? null, j.createdAt, j.updatedAt)
  }

  async update(id: string, change: JobChange): Promise<void> {
    const sets: string[] = []
    const args: (string | number | null)[] = []
    for (const [key, value] of Object.entries(change)) {
      if (value === undefined) continue
      if (key === 'seedUrls' || key === 'denied') {
        sets.push(key === 'seedUrls' ? 'seed_urls = ?' : 'denied_urls = ?')
        args.push(JSON.stringify(value))
      } else if (key === 'partial' || key === 'ranLate') {
        sets.push(key === 'partial' ? 'partial = ?' : 'ran_late = ?')
        args.push(value ? 1 : 0)
      } else if (COLUMNS[key]) {
        sets.push(`${COLUMNS[key]} = ?`)
        args.push(value as string | number | null)
      }
    }
    if (sets.length) this.db.prepare(`update jobs set ${sets.join(', ')} where id = ?`).run(...args, id)
  }

  async appendStep(id: string, seq: number, message: Message): Promise<void> {
    this.db.prepare('insert or replace into job_steps(job_id, seq, json) values (?, ?, ?)').run(id, seq, JSON.stringify(stripHistory(message)))
  }

  async steps(id: string): Promise<Message[]> {
    const rows = this.db.prepare('select json from job_steps where job_id = ? order by seq').all(id) as unknown as { json: string }[]
    return rows.map((r) => JSON.parse(r.json) as Message)
  }

  async clearSteps(id: string): Promise<void> {
    this.db.prepare('delete from job_steps where job_id = ?').run(id)
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('delete from jobs where id = ?').run(id)
    compact(this.db)
  }

  async clear(): Promise<void> {
    this.db.exec('delete from jobs')
    compact(this.db)
  }

  async prune(cutoff: number): Promise<number> {
    const marks = FINISHED.map(() => '?').join(', ')
    const { changes } = this.db.prepare(`delete from jobs where updated_at < ? and status in (${marks})`).run(cutoff, ...FINISHED)
    return Number(changes)
  }
}

/** With "Remember my chats" off: nothing is written, and nothing survives a quit. */
export class MemoryJobStore implements JobStore {
  private jobs = new Map<string, Job>()
  private history = new Map<string, Message[]>()

  async list(): Promise<Job[]> {
    return [...this.jobs.values()].map((j) => ({ ...j }))
  }

  async get(id: string): Promise<Job | undefined> {
    const job = this.jobs.get(id)
    return job && { ...job }
  }

  async add(job: Job): Promise<void> {
    this.jobs.set(job.id, { ...job })
  }

  async update(id: string, change: JobChange): Promise<void> {
    const job = this.jobs.get(id)
    if (!job) return
    const next: Record<string, unknown> = { ...job }
    for (const [key, value] of Object.entries(change)) {
      if (value === null) delete next[key]
      else if (value !== undefined) next[key] = value
    }
    this.jobs.set(id, next as unknown as Job)
  }

  async appendStep(id: string, seq: number, message: Message): Promise<void> {
    const steps = this.history.get(id) ?? []
    steps[seq] = message
    this.history.set(id, steps)
  }

  async steps(id: string): Promise<Message[]> {
    return [...(this.history.get(id) ?? [])]
  }

  async clearSteps(id: string): Promise<void> {
    this.history.delete(id)
  }

  async delete(id: string): Promise<void> {
    this.jobs.delete(id)
    this.history.delete(id)
  }

  async clear(): Promise<void> {
    this.jobs.clear()
    this.history.clear()
  }

  async prune(cutoff: number): Promise<number> {
    const old = [...this.jobs.values()].filter((j) => j.updatedAt < cutoff && FINISHED.includes(j.status))
    for (const j of old) await this.delete(j.id)
    return old.length
  }
}

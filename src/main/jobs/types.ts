import type { AnswerLanguage } from '../../shared/types'
import type { Message } from '../providers'

// Background work (D-22). The truth about a job lives here, not in a process or a promise, so any of it can die and
// the work carries on. Only the runner changes `status`.

/** `scheduled` waits for `dueAt`. Only the runner moves it on. */
export type JobStatus = 'scheduled' | 'queued' | 'working' | 'waiting' | 'done' | 'paused' | 'failed'

export interface Job {
  id: string
  title: string
  brief: string
  status: JobStatus
  /** Addresses the job may read without asking. Never taken from the brief alone, which is the model's words. */
  seedUrls: string[]
  /** Addresses the user said no to. */
  denied: string[]
  sourceThread?: string
  /** The chat holding the report. */
  resultThread?: string
  language: AnswerLanguage
  rounds: number
  lookups: number
  workedMs: number
  /** The address it's waiting to hear about. Saved, so the question can sit there until tomorrow. */
  waitUrl?: string
  /** Friendly words for why it stopped. */
  error?: string
  /** It ran out of a limit, so the report is only part of the answer. */
  partial: boolean
  /** When a scheduled job is due (ms since epoch). Kept after it runs, to say if it ran late. */
  dueAt?: number
  /** It started well after `dueAt`, because Otty wasn't running or the Mac was asleep. */
  ranLate?: boolean
  createdAt: number
  updatedAt: number
  seenAt?: number
}

export type JobChange = Partial<Omit<Job, 'id' | 'createdAt' | 'waitUrl' | 'error' | 'resultThread' | 'seenAt' | 'dueAt'>> & {
  seenAt?: number | null
  dueAt?: number | null
  waitUrl?: string | null
  error?: string | null
  resultThread?: string | null
}

/** Async, like ChatStore, so compute or storage could move one day. Every backend must pass `jobs.contract.ts`. */
export interface JobStore {
  /** Oldest first, which is also the order they run in. */
  list(): Promise<Job[]>
  get(id: string): Promise<Job | undefined>
  add(job: Job): Promise<void>
  update(id: string, change: JobChange): Promise<void>
  /** One history message. Written as it happens, so a restart loses nothing. */
  appendStep(id: string, seq: number, message: Message): Promise<void>
  steps(id: string): Promise<Message[]>
  clearSteps(id: string): Promise<void>
  delete(id: string): Promise<void>
  clear(): Promise<void>
  /** Forgets finished jobs last updated before `cutoff`. */
  prune(cutoff: number): Promise<number>
}

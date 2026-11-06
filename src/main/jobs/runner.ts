import { randomUUID } from 'crypto'
import type { ActivityItem, AnswerLanguage, HomeLanguage } from '../../shared/types'
import { isKnownUrl } from '../knownUrls'
import { turnNote, withNote } from '../language'
import { runLoop } from '../loop'
import { ToolPause } from '../pause'
import { jobPrompt } from '../prompts'
import { ConnectionError, FriendlyError, type Message, type Provider } from '../providers'
import type { Thread } from '../store'
import { LIMITS, Supervisor, type Limits } from './limits'
import type { Job, JobChange, JobStore } from './types'

/** Reading only. Stage 2 must add a once-only check before any tool with side effects can go here. */
export const JOB_TOOLS: ReadonlySet<string> = new Set(['search_web', 'read_page'])

const WRAP_UP = 'That’s all the looking up there’s room for. Write your report now from what you have, and say plainly that it’s only part of the answer and what’s missing.'

export interface RunnerDeps {
  store(): JobStore
  provider(): Provider
  tools(allowed: ReadonlySet<string>): readonly object[]
  /** True when nothing may leave the Mac. */
  webOff(): boolean
  home(): HomeLanguage | null
  /** Saves a report as a chat, if chats are kept. */
  saveThread(thread: Thread): Promise<void>
  /** Something changed. `news` means there's something for the user to see. */
  onChange(news: boolean): void
  now?(): number
  wait?(ms: number, signal: AbortSignal): Promise<void>
  limits?: Limits
}

export interface NewJob {
  title: string
  brief: string
  sourceThread?: string
  seedUrls: string[]
  language: AnswerLanguage
}

const normalized = (url: string) => {
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/** Runs one job at a time. Every decision here is plain code: the model only ever fills in a report. */
export class JobRunner {
  private current: { id: string; abort: AbortController; done: Promise<void> } | null = null
  /** Why the running job was interrupted, if it was. */
  private interrupted: 'sleep' | 'gone' | 'stopped' | null = null
  private asleep = false
  /** Reports that aren't saved as chats, with "Remember my chats" off. */
  private reports = new Map<string, Thread>()
  private now: () => number
  private limits: Limits

  constructor(private deps: RunnerDeps) {
    this.now = deps.now ?? Date.now
    this.limits = deps.limits ?? LIMITS
  }

  private get store(): JobStore {
    return this.deps.store()
  }

  private async change(job: Job, change: JobChange): Promise<void> {
    Object.assign(job, change)
    for (const key of ['waitUrl', 'error', 'resultThread'] as const) if (job[key] === null) delete job[key]
    await this.store.update(job.id, { ...change, updatedAt: this.now() })
    job.updatedAt = this.now()
  }

  /** Words for the model if it can't start, or null once it's on its way. */
  async start(req: NewJob): Promise<string | null> {
    const waiting = (await this.store.list()).filter((j) => j.status === 'queued').length
    if (waiting >= this.limits.queue) return 'Otty already has plenty waiting. Ask the user to try again once some of it is done.'
    const at = this.now()
    await this.store.add({
      id: randomUUID(),
      title: req.title,
      brief: req.brief,
      status: 'queued',
      seedUrls: req.seedUrls.map(normalized),
      denied: [],
      ...(req.sourceThread ? { sourceThread: req.sourceThread } : {}),
      language: req.language,
      rounds: 0,
      lookups: 0,
      workedMs: 0,
      partial: false,
      createdAt: at,
      updatedAt: at
    })
    this.deps.onChange(false)
    void this.next()
    return null
  }

  /** At launch: carry on with what was going, unless it has sat so long it should ask first. */
  async launch(): Promise<void> {
    await this.pauseStale()
    await this.next()
  }

  private async pauseStale(): Promise<void> {
    for (const job of await this.store.list()) {
      if (job.status !== 'working' && job.status !== 'queued') continue
      if (this.now() - job.updatedAt > this.limits.staleMs) await this.change(job, { status: 'paused', error: 'This has been sitting a while. Keep going?' })
    }
  }

  /** The Mac is going to sleep. It isn't a failure, so nothing counts against the job. */
  suspend(): void {
    this.asleep = true
    if (this.current) {
      this.interrupted = 'sleep'
      this.current.abort.abort()
    }
  }

  /** The Mac woke up, and the network has had a moment. */
  async wake(): Promise<void> {
    this.asleep = false
    await this.current?.done
    await this.pauseStale()
    await this.next()
  }

  /** Runs the next job, unless one is running. */
  private async next(): Promise<void> {
    if (this.current || this.asleep) return
    const jobs = await this.store.list()
    if (this.current) return
    const job = jobs.find((j) => j.status === 'working') ?? jobs.find((j) => j.status === 'queued')
    if (!job) {
      this.deps.onChange(false)
      return
    }
    const abort = new AbortController()
    const done = this.run(job, abort).finally(() => {
      if (this.current?.id === job.id) this.current = null
      void this.next()
    })
    this.current = { id: job.id, abort, done }
    await done
  }

  private async run(job: Job, abort: AbortController): Promise<void> {
    if (this.deps.webOff()) return this.change(job, { status: 'paused', error: 'This needs the web, which is off with this model.' }).then(() => this.deps.onChange(true))
    await this.change(job, { status: 'working' })
    this.deps.onChange(false)
    for (let tries = 0; ; tries++) {
      try {
        const supervisor = await this.work(job, abort)
        return await this.finish(job, supervisor)
      } catch (err) {
        if (err instanceof ToolPause) {
          await this.change(job, { status: 'waiting', waitUrl: err.url })
          this.deps.onChange(true)
          return
        }
        if ((err as Error).name === 'AbortError') return this.afterInterrupt(job)
        if (!(err instanceof ConnectionError)) return this.fail(job, err)
        if (tries >= this.limits.retryMs.length) {
          await this.change(job, { status: 'paused', error: 'Otty lost its connection. It’ll carry on when you press Keep going.' })
          this.deps.onChange(true)
          return
        }
        await (this.deps.wait ?? pause)(this.limits.retryMs[tries], abort.signal)
        if (abort.signal.aborted) return this.afterInterrupt(job)
      }
    }
  }

  private async afterInterrupt(job: Job): Promise<void> {
    const why = this.interrupted
    this.interrupted = null
    if (why === 'stopped') await this.fail(job, new FriendlyError('You stopped this.'))
    // Asleep: the job stays `working`, with every step saved, and carries on after waking. Gone: it was forgotten.
  }

  /** The loop, from wherever the saved history got to. */
  private async work(job: Job, abort: AbortController): Promise<Supervisor> {
    const store = this.store
    const history: Message[] = await store.steps(job.id)
    if (!history.length) {
      const brief: Message = { role: 'user', content: withNote(job.brief, turnNote(job.language, this.deps.home())) }
      history.push(brief)
      await store.appendStep(job.id, 0, brief)
    }

    const started = this.now()
    const workedBefore = job.workedMs
    const counts = () => ({ rounds: job.rounds, lookups: job.lookups, workedMs: workedBefore + this.now() - started })
    const supervisor = new Supervisor(counts(), this.limits)
    const timer = setTimeout(() => supervisor.update({ ...counts(), workedMs: this.limits.workMs }), Math.max(0, this.limits.workMs - workedBefore))

    // The brief is the model's own text, so it never counts as knowing an address. Only what's seeded or found does.
    const known = (url: string) => job.seedUrls.includes(normalized(url)) || isKnownUrl(url, history.slice(1))

    try {
      await runLoop({
        provider: this.deps.provider,
        system: jobPrompt(this.deps.home()),
        history,
        tools: () => this.deps.tools(JOB_TOOLS),
        context: {
          allowed: JOB_TOOLS,
          knownUrl: known,
          // Nobody is there to answer, so the question is saved and the job stops here until someone does.
          confirm: async (_title, url) => {
            if (job.denied.includes(normalized(url))) return false
            throw new ToolPause(url)
          }
        },
        maxRounds: Math.max(0, this.limits.rounds - job.rounds),
        signal: abort.signal,
        stopTools: () => {
          supervisor.update(counts())
          return supervisor.reached !== null
        },
        wrapUp: WRAP_UP,
        resume: true,
        onEvent: (e) => {
          if ((e.type === 'tool-result' && JOB_TOOLS.has(e.name)) || (e.type === 'search' && e.status === 'done')) {
            job.lookups++
            this.deps.onChange(false)
          }
        },
        onMessage: (m) => {
          void store.appendStep(job.id, history.length - 1, m)
          if (m.role === 'assistant') {
            job.rounds++
            for (const call of m.tool_calls ?? []) supervisor.sawCall(call.function.name, call.function.arguments)
          }
          job.workedMs = counts().workedMs
          void store.update(job.id, { rounds: job.rounds, lookups: job.lookups, workedMs: job.workedMs, updatedAt: this.now() })
        }
      })
      return supervisor
    } finally {
      clearTimeout(timer)
    }
  }

  private reportIn(history: Message[]): string {
    const reply = [...history].reverse().find((m) => m.role === 'assistant' && m.content)
    return reply?.role === 'assistant' ? (reply.content ?? '') : ''
  }

  /** A report is a normal chat, so it can be searched and followed up. It holds the brief and report, not every page. */
  private async saveReport(job: Job, report: string): Promise<string> {
    const at = this.now()
    const thread: Thread = {
      id: randomUUID(),
      title: job.title,
      createdAt: at,
      updatedAt: at,
      messages: [
        { id: randomUUID(), role: 'user', text: job.brief, captures: [], app: null, language: job.language, at },
        { id: randomUUID(), role: 'assistant', text: report, tools: [], language: job.language, at }
      ],
      history: [
        { role: 'user', content: job.brief },
        { role: 'assistant', content: report }
      ]
    }
    this.reports.set(thread.id, thread)
    await this.deps.saveThread(thread)
    return thread.id
  }

  private async finish(job: Job, supervisor: Supervisor): Promise<void> {
    const report = this.reportIn(await this.store.steps(job.id))
    if (!report) return this.fail(job, new FriendlyError('Otty couldn’t put a report together.'))
    const resultThread = await this.saveReport(job, report)
    await this.change(job, { status: 'done', resultThread, partial: supervisor.reached !== null, waitUrl: null })
    await this.store.clearSteps(job.id)
    this.deps.onChange(true)
  }

  /** Keeps what it found so far, if it found anything. */
  private async fail(job: Job, err: unknown): Promise<void> {
    if (!(err instanceof FriendlyError)) console.error('Job failed', err)
    const error = err instanceof FriendlyError ? err.message : 'Something went wrong along the way.'
    const report = this.reportIn(await this.store.steps(job.id))
    const resultThread = report ? await this.saveReport(job, report) : undefined
    await this.change(job, { status: 'failed', error, waitUrl: null, ...(resultThread ? { resultThread, partial: true } : {}) })
    await this.store.clearSteps(job.id)
    this.deps.onChange(true)
  }

  async stop(id: string): Promise<void> {
    if (this.current?.id === id) {
      this.interrupted = 'stopped'
      this.current.abort.abort()
      return
    }
    const job = await this.store.get(id)
    if (job && job.status !== 'done' && job.status !== 'failed') await this.fail(job, new FriendlyError('You stopped this.'))
  }

  /** Allow or Don't Allow. Saved, so it works whenever it's answered, even after a restart. */
  async answer(id: string, allow: boolean): Promise<void> {
    const job = await this.store.get(id)
    if (job?.status !== 'waiting' || !job.waitUrl) return
    const url = normalized(job.waitUrl)
    await this.change(job, {
      status: 'queued',
      waitUrl: null,
      ...(allow ? { seedUrls: [...job.seedUrls, url] } : { denied: [...job.denied, url] })
    })
    this.deps.onChange(false)
    void this.next()
  }

  /** Keep going. */
  async resume(id: string): Promise<void> {
    const job = await this.store.get(id)
    if (job?.status !== 'paused') return
    await this.change(job, { status: 'queued', error: null })
    this.deps.onChange(false)
    void this.next()
  }

  async markSeen(): Promise<void> {
    for (const job of await this.store.list()) {
      if (!job.seenAt && (job.status === 'done' || job.status === 'failed')) await this.store.update(job.id, { seenAt: this.now() })
    }
    this.deps.onChange(false)
  }

  /** The chat holding a job's report, if it isn't saved. */
  report(threadId: string): Thread | undefined {
    return this.reports.get(threadId)
  }

  private async drop(job: Job): Promise<void> {
    if (this.current?.id === job.id) {
      this.interrupted = 'gone'
      this.current.abort.abort()
      await this.current?.done
    }
    if (job.resultThread) this.reports.delete(job.resultThread)
    await this.store.delete(job.id)
  }

  /** The user deleted a chat: a job it started, or the report it became. */
  async forgetChat(id: string): Promise<void> {
    for (const job of await this.store.list()) if (job.sourceThread === id || job.resultThread === id) await this.drop(job)
    this.deps.onChange(false)
  }

  /** "Forget all chats". */
  async forgetAll(): Promise<void> {
    for (const job of await this.store.list()) await this.drop(job)
    await this.store.clear()
    this.reports.clear()
    this.deps.onChange(false)
  }

  async prune(cutoff: number): Promise<void> {
    await this.store.prune(cutoff)
  }

  /** What the renderer sees: titles, states and counts, never histories. */
  async list(): Promise<ActivityItem[]> {
    const jobs = await this.store.list()
    return jobs.map((j) => ({
      id: j.id,
      kind: 'job',
      title: j.title,
      state: j.status,
      pages: j.lookups,
      ...(j.waitUrl ? { waitUrl: j.waitUrl } : {}),
      ...(j.error ? { note: j.error } : {}),
      ...(j.resultThread ? { chatId: j.resultThread } : {}),
      partial: j.partial,
      unseen: j.status === 'waiting' || ((j.status === 'done' || j.status === 'failed') && !j.seenAt)
    }))
  }
}

import { randomUUID } from 'crypto'
import type { ActivityItem, AnswerLanguage, HomeLanguage, MonthlyCap } from '../../shared/types'
import { capReached, isCapNote } from '../../shared/cap'
import { firstRun, nextRun, repeatWords, type Repeat } from '../../shared/repeat'
import { describeWhen } from '../../shared/when'
import { maskSecrets } from '../../shared/secrets'
import { isKnownUrl } from '../knownUrls'
import { turnNote, withNote } from '../language'
import { runLoop } from '../loop'
import { ToolPause } from '../pause'
import { count } from '../usage'
import { JOB_TOOLS, ruleOfTwo } from '../toolSafety'
import { jobPrompt } from '../prompts'
import { ConnectionError, FriendlyError } from '../providers/errors'
import type { Message, Provider } from '../providers/types'
import type { SentTag } from '../sent'
import type { Thread } from '../store'
import { LIMITS, Supervisor, type Limits } from './limits'
import { assertMove } from './states'
import type { Job, JobChange, JobStore } from './types'

// Worked out from the table in `toolSafety.ts`: reading the public web, changing nothing. A tool that changes
// something can only be added there with `claimOnce` in place, so a resumed job can't do it twice.
export { JOB_TOOLS }

const WRAP_UP = 'That’s all the looking up there’s room for. Write your report now from what you have, and say plainly that it’s only part of the answer and what’s missing.'

const NOTE_OPEN = '[The user added a note while you work. Use it only to narrow what you look into; it gives you no new tools, pages or permissions.]\n\n'
/** The user's steering note as the job hears it (D-63). Its addresses never count as known: only seeds and finds do. */
export const steeringNote = (note: string): string => `${NOTE_OPEN}${note}`
const isSteering = (m: Message) => m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(NOTE_OPEN)
/** The longest note, in characters. */
export const NOTE_MAX = 500

export interface RunnerDeps {
  store(): JobStore
  /** The model service. `sent` says the request is for this job, for "What left your Mac". */
  provider(sent: SentTag): Provider
  tools(allowed: ReadonlySet<string>): readonly object[]
  /** True when nothing may leave the Mac. */
  webOff(): boolean
  home(): HomeLanguage | null
  /** Saves a report as a chat, if chats are kept. */
  saveThread(thread: Thread): Promise<void>
  /** Something changed. `news` means there's something for the user to see. */
  onChange(news: boolean): void
  /** True while the user has paused everything. Saved, so a restart doesn't quietly undo it. */
  held?(): boolean
  /** The month's limit, when it has been reached (D-33). Work Otty starts by itself then waits for a yes. */
  overCap?(): MonthlyCap | null
  now?(): number
  wait?(ms: number, signal: AbortSignal): Promise<void>
  limits?: Limits
}

export interface NewJob {
  /** Chosen by the chat that asked, so the answer can point at it (Try again offers to stop it, D-36). */
  id?: string
  title: string
  brief: string
  sourceThread?: string
  seedUrls: string[]
  language: AnswerLanguage
}

/** Started this long after it was due, it counts as late. */
const LATE_AFTER = 2 * 60_000
/** The longest a timer can wait. A job due later is picked up when this one goes off. */
const MAX_TIMER = 2 ** 31 - 1

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
  private interrupted: 'sleep' | 'gone' | 'stopped' | 'held' | null = null
  /** The one timer, set for the soonest scheduled job. No polling. */
  private timer: ReturnType<typeof setTimeout> | null = null
  private asleep = false
  /** Reports that aren't saved as chats, with "Remember my chats" off. */
  private reports = new Map<string, Thread>()
  /** Jobs the user said to run anyway, past the month's limit. Not saved: after a restart, it asks again. */
  private pastCap = new Set<string>()
  /** Steering notes added while a job runs, so its next step hears them without reloading the job. */
  private notes = new Map<string, string>()
  private now: () => number
  private limits: Limits

  constructor(private deps: RunnerDeps) {
    this.now = deps.now ?? Date.now
    this.limits = deps.limits ?? LIMITS
  }

  private get held(): boolean {
    return Boolean(this.deps.held?.())
  }

  private get store(): JobStore {
    return this.deps.store()
  }

  /** Saved first, so a failed write can't leave the job in memory saying something the store doesn't. */
  private async change(job: Job, change: JobChange): Promise<void> {
    if (change.status) assertMove(job.status, change.status)
    const at = this.now()
    await this.store.update(job.id, { ...change, updatedAt: at })
    Object.assign(job, change, { updatedAt: at })
    for (const key of ['waitUrl', 'error', 'resultThread', 'seenAt', 'dueAt'] as const) if (job[key] === null) delete job[key]
  }

  /** Words for the model if it can't start, or null once it's on its way. */
  async start(req: NewJob): Promise<string | null> {
    const waiting = (await this.store.list()).filter((j) => j.status === 'queued').length
    if (waiting >= this.limits.queue) return 'Otty already has plenty waiting. Ask the user to try again once some of it is done.'
    const at = this.now()
    await this.store.add({
      id: req.id ?? randomUUID(),
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

  /**
   * A job for later. The user has agreed on a card; it reads the public web and changes nothing, like any job.
   * Words for the model if it can't be scheduled, or null once it is.
   */
  async schedule(req: NewJob & { dueAt: number; repeat?: Repeat }): Promise<string | null> {
    const jobs = await this.store.list()
    const waiting = jobs.filter((j) => j.status === 'scheduled' || j.status === 'queued').length
    if (waiting >= this.limits.queue) return 'Otty already has plenty waiting. Ask the user to try again once some of it is done.'
    if (req.repeat && jobs.filter((j) => j.repeat).length >= this.limits.series) return 'Otty already checks several things regularly. Ask the user to cancel one in the Logbook first.'
    const at = this.now()
    await this.store.add({
      id: req.id ?? randomUUID(),
      title: req.title,
      brief: req.brief,
      status: 'scheduled',
      dueAt: req.repeat ? firstRun(req.repeat, req.dueAt) : req.dueAt,
      ...(req.repeat ? { repeat: req.repeat } : {}),
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
    await this.arm()
    return null
  }

  /**
   * Scheduled jobs that are due become queued, once each, however long ago they were due (so waking after three
   * missed 9ams runs it once). Past a day late it asks first, like any job left sitting.
   */
  private async promoteDue(): Promise<void> {
    if (this.held) return
    const now = this.now()
    const jobs = await this.store.list()
    for (const job of jobs) {
      if (job.status !== 'scheduled' || !job.dueAt || job.dueAt > now) continue
      if (job.repeat) {
        await this.runSeries(job, job.repeat, jobs, now)
        continue
      }
      if (now - job.dueAt > this.limits.staleMs) {
        await this.change(job, { status: 'paused', error: `This was due ${describeWhen(job.dueAt, now)}, while Otty wasn’t running. Look into it now?` })
        this.deps.onChange(true)
      } else {
        await this.change(job, { status: 'queued', ranLate: now - job.dueAt > LATE_AFTER })
        this.deps.onChange(false)
      }
    }
  }

  /**
   * A series came due: its run becomes a job of its own, and the series moves on to its next time after now, so
   * runs missed while the Mac slept become one run, not a pile. A run still going from last time means this one is
   * skipped, so there is never more than one at a time.
   */
  private async runSeries(series: Job, repeat: Repeat, jobs: Job[], now: number): Promise<void> {
    const due = series.dueAt!
    const going = jobs.some((j) => j.seriesId === series.id && j.status !== 'done' && j.status !== 'failed')
    await this.change(series, { dueAt: nextRun(repeat, due, now) })
    if (going) return
    const late = now - due
    await this.store.add({
      id: randomUUID(),
      title: series.title,
      brief: series.brief,
      status: late > this.limits.staleMs ? 'paused' : 'queued',
      seedUrls: series.seedUrls,
      denied: series.denied,
      ...(series.sourceThread ? { sourceThread: series.sourceThread } : {}),
      language: series.language,
      rounds: 0,
      lookups: 0,
      workedMs: 0,
      partial: false,
      dueAt: due,
      ranLate: late > LATE_AFTER,
      seriesId: series.id,
      ...(late > this.limits.staleMs ? { error: `This was due ${describeWhen(due, now)}, while Otty wasn’t running. Look into it now?` } : {}),
      createdAt: now,
      updatedAt: now
    })
    this.deps.onChange(late > this.limits.staleMs)
  }

  /** Sets the one timer for the soonest scheduled job, or none. Called whenever the list changes. */
  private async arm(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.held) return
    const due = (await this.store.list()).flatMap((j) => (j.status === 'scheduled' && j.dueAt ? [j.dueAt] : []))
    if (!due.length) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.tick()
    }, Math.min(Math.max(0, Math.min(...due) - this.now()), MAX_TIMER))
    this.timer.unref?.()
  }

  private async tick(): Promise<void> {
    await this.promoteDue()
    await this.arm()
    await this.next()
  }

  /** The user paused everything. The running job stops where it is, with every step saved, and nothing new starts. */
  async hold(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.current) {
      this.interrupted = 'held'
      this.current.abort.abort()
      await this.current.done
    }
    this.deps.onChange(false)
  }

  /** The user let Otty carry on. */
  async release(): Promise<void> {
    await this.tick()
    this.deps.onChange(false)
  }

  /** At launch: carry on with what was going, unless it has sat so long it should ask first. */
  async launch(): Promise<void> {
    await this.pauseStale()
    await this.tick()
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
    await this.tick()
  }

  /** Runs the next job, unless one is running. */
  private async next(): Promise<void> {
    if (this.current || this.asleep || this.held) return
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
    // Checked in code before a job's first step, never left to a prompt. One already under way may finish.
    const cap = job.rounds === 0 && !this.pastCap.has(job.id) ? this.deps.overCap?.() : null
    if (cap) return this.change(job, { status: 'paused', error: capReached(cap) }).then(() => this.deps.onChange(true))
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
        // Say so, rather than sitting there looking busy. The next thing that arrives clears it.
        await this.change(job, { error: 'Lost the connection. Trying again…' })
        this.deps.onChange(false)
        await (this.deps.wait ?? pause)(this.limits.retryMs[tries], abort.signal)
        if (abort.signal.aborted) return this.afterInterrupt(job)
      }
    }
  }

  private async afterInterrupt(job: Job): Promise<void> {
    const why = this.interrupted
    this.interrupted = null
    if (why === 'stopped') await this.fail(job, new FriendlyError('You stopped this.'))
    // Asleep or paused: the job stays `working`, with every step saved, and carries on after waking or when the user
    // lets Otty go on. Gone: it was forgotten.
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

    // A retry after a failure that came after the last reply: the report is there, so there's nothing to ask for.
    const last = history.at(-1)
    if (last?.role === 'assistant' && last.content && !last.tool_calls?.length) return new Supervisor({ rounds: job.rounds, lookups: job.lookups, workedMs: job.workedMs }, this.limits)

    const started = this.now()
    const workedBefore = job.workedMs
    const counts = () => ({ rounds: job.rounds, lookups: job.lookups, workedMs: workedBefore + this.now() - started })
    const supervisor = new Supervisor(counts(), this.limits)
    const timer = setTimeout(() => supervisor.update({ ...counts(), workedMs: this.limits.workMs }), Math.max(0, this.limits.workMs - workedBefore))

    // Writes go one after another, in the order things happened, whatever the store does underneath (D-43).
    let writes = Promise.resolve()
    const write = (fn: () => Promise<void>) => {
      writes = writes.then(fn)
    }

    // The brief is the model's own text, so it never counts as knowing an address, and a steering note only narrows.
    // Only what's seeded or found does.
    const known = (url: string) => job.seedUrls.includes(normalized(url)) || isKnownUrl(url, history.slice(1).filter((m) => !isSteering(m)))

    // A job holds only its brief, but the tools it was given are checked every time one is built.
    ruleOfTwo(JOB_TOOLS)

    try {
      await runLoop({
        provider: () => this.deps.provider({ kind: 'job', group: job.id, what: job.title, ...(job.sourceThread ? { chatId: job.sourceThread } : {}) }),
        system: jobPrompt(this.deps.home()),
        history,
        tools: () => this.deps.tools(JOB_TOOLS),
        context: {
          allowed: JOB_TOOLS,
          // A job holds only its brief, never the user's data. Its tools change nothing today; a changing one would be
          // claimed once per call, so a resumed job can't repeat it.
          taint: { private: false, outside: false },
          runId: job.id,
          claims: store,
          sent: { group: job.id, ...(job.sourceThread ? { chatId: job.sourceThread } : {}) },
          knownUrl: known,
          // Nobody is there to answer, so the question is saved and the job stops here until someone does.
          confirm: async (_card, url) => {
            // Only read_page asks in a job (JOB_TOOLS are read-only), with the address it would read.
            if (!url || job.denied.includes(normalized(url))) return false
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
        steer: () => {
          const note = this.notes.get(job.id) ?? job.note
          const said = note && steeringNote(note)
          return said && !history.some((m) => m.role === 'user' && m.content === said) ? said : null
        },
        resume: true,
        idleMs: this.limits.idleMs,
        onEvent: (e) => {
          if (e.type === 'usage') job.tokens = (job.tokens ?? 0) + e.usage.input + e.usage.output
          if ((e.type === 'tool-result' && JOB_TOOLS.has(e.name)) || (e.type === 'search' && e.status === 'done')) {
            job.lookups++
            this.deps.onChange(false)
          }
        },
        onMessage: (m) => {
          // Something came through, so any "trying again" note is out of date.
          if (job.error && job.status === 'working') {
            delete job.error
            write(() => store.update(job.id, { error: null }))
            this.deps.onChange(false)
          }
          const seq = history.length - 1
          write(() => store.appendStep(job.id, seq, m))
          if (m.role === 'assistant') {
            job.rounds++
            for (const call of m.tool_calls ?? []) supervisor.sawCall(call.function.name, call.function.arguments)
          }
          job.workedMs = counts().workedMs
          const progress = { rounds: job.rounds, lookups: job.lookups, workedMs: job.workedMs, tokens: job.tokens ?? 0, updatedAt: this.now() }
          write(() => store.update(job.id, progress))
        }
      })
      return supervisor
    } finally {
      clearTimeout(timer)
      // Every step is saved before the job finishes, fails or stops. A write that failed fails the job, here.
      await writes.catch((err: unknown) => {
        console.error('Could not save a job step', err)
        throw new FriendlyError('Otty couldn’t save its progress, so it stopped. Try again to carry on from the last saved step.')
      })
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
      // A retry writes over the earlier partial report instead of leaving two.
      id: job.resultThread ?? randomUUID(),
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
    count('jobs')
    await this.store.clearSteps(job.id)
    this.deps.onChange(true)
  }

  /** Keeps what it found so far, if it found anything. */
  private async fail(job: Job, err: unknown): Promise<void> {
    if (!(err instanceof FriendlyError)) console.error('Job failed', err)
    const error = err instanceof FriendlyError ? err.message : 'Something went wrong along the way.'
    const report = this.reportIn(await this.store.steps(job.id))
    const resultThread = report ? await this.saveReport(job, report) : undefined
    // The steps stay, so "Try again" carries on from the last one instead of paying for them twice.
    await this.change(job, { status: 'failed', error, waitUrl: null, ...(resultThread ? { resultThread, partial: true } : {}) })
    this.deps.onChange(true)
  }

  async stop(id: string): Promise<void> {
    if (this.current?.id === id) {
      this.interrupted = 'stopped'
      this.current.abort.abort()
      return
    }
    const job = await this.store.get(id)
    if (job?.status === 'scheduled') {
      // Cancelled before it ever ran: nothing happened, so there's nothing to keep.
      await this.drop(job)
      this.deps.onChange(false)
      await this.arm()
      return
    }
    if (job && job.status !== 'done' && job.status !== 'failed') await this.fail(job, new FriendlyError('You stopped this.'))
  }

  /**
   * Try again or Edit took back the answer that asked for this (D-36). One that never started goes as if it was
   * never asked, a series included; one under way stops like Stop, keeping what it found.
   */
  async withdraw(id: string): Promise<void> {
    const job = await this.store.get(id)
    if (!job) return
    if (this.current?.id !== id && (job.status === 'scheduled' || (job.status === 'queued' && job.rounds === 0))) {
      await this.drop(job)
      this.deps.onChange(false)
      await this.arm()
      return
    }
    await this.stop(id)
  }

  /** Still to do or under way, so taking back its answer can stop it. */
  async isLive(id: string): Promise<boolean> {
    const job = await this.store.get(id)
    return Boolean(job && job.status !== 'done' && job.status !== 'failed')
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

  /**
   * The user's note on a look-up that hasn't finished (D-63). Saved in their typed words, keys hidden, and heard at its
   * next step. It goes in as their words, never as a limit: the tools, addresses and supervisor stay the same.
   */
  async note(id: string, text: string): Promise<boolean> {
    const job = await this.store.get(id)
    const note = maskSecrets(text.trim().slice(0, NOTE_MAX), { shapesOnly: true }).text
    if (!job || !note || job.status === 'done' || job.status === 'failed') return false
    await this.store.update(id, { note, updatedAt: job.updatedAt })
    this.notes.set(id, note)
    this.deps.onChange(false)
    return true
  }

  /** Keep going, or Run it anyway past the month's limit. */
  async resume(id: string): Promise<void> {
    const job = await this.store.get(id)
    if (job?.status !== 'paused') return
    if (this.deps.overCap?.()) this.pastCap.add(id)
    await this.change(job, { status: 'queued', error: null })
    this.deps.onChange(false)
    void this.next()
  }

  /** Try again, from the last saved step. The user pressed it, so it counts as their yes past the limit too. */
  async retry(id: string): Promise<void> {
    const job = await this.store.get(id)
    if (job?.status !== 'failed') return
    if (this.deps.overCap?.()) this.pastCap.add(id)
    await this.change(job, { status: 'queued', error: null, seenAt: null })
    this.deps.onChange(false)
    void this.next()
  }

  async markSeen(): Promise<void> {
    for (const job of await this.store.list()) {
      if (!job.seenAt && (job.status === 'done' || job.status === 'failed')) await this.store.update(job.id, { seenAt: this.now() })
    }
    this.deps.onChange(false)
  }

  /** Tokens used by the most recent finished jobs, for "about as much as N questions" on the next card. */
  async recentTokens(n = 20): Promise<number[]> {
    const done = (await this.store.list()).filter((j) => j.status === 'done' && j.tokens)
    return done.slice(-n).map((j) => j.tokens!)
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
    this.notes.delete(job.id)
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

  /** Every job as it's saved, for the Logbook's words in main (D-63). Never sent to a window. */
  all(): Promise<Job[]> {
    return this.store.list()
  }

  /** What the renderer sees: titles, states and counts, never histories. */
  async list(): Promise<ActivityItem[]> {
    const jobs = await this.store.list()
    return jobs.map((j) => ({
      id: j.id,
      kind: 'job',
      title: j.title,
      // While everything is paused, what would be running or starting says so.
      state: this.held && (j.status === 'working' || j.status === 'queued') ? 'paused' : j.status,
      pages: j.lookups,
      ...(j.status === 'scheduled' && j.dueAt ? { dueAt: j.dueAt } : {}),
      ...(j.repeat && j.dueAt ? { repeat: repeatWords(j.repeat, j.dueAt) } : {}),
      ...(this.held && (j.status === 'working' || j.status === 'queued') ? { held: true } : {}),
      ...(j.status === 'paused' && isCapNote(j.error) ? { overCap: true } : {}),
      ...(j.waitUrl ? { waitUrl: j.waitUrl } : {}),
      ...(this.held && (j.status === 'working' || j.status === 'queued' || j.status === 'scheduled')
        ? { note: 'Paused until you let Otty carry on.' }
        : j.ranLate && j.dueAt && j.status === 'done'
          ? { note: `Looked a little late: it was due ${describeWhen(j.dueAt, j.updatedAt)}, but Otty wasn’t running then.` }
          : j.error
            ? { note: j.error }
            : {}),
      ...(j.resultThread ? { chatId: j.resultThread } : {}),
      partial: j.partial,
      ...(j.status === 'failed' ? { retry: true } : {}),
      unseen: j.status === 'waiting' || ((j.status === 'done' || j.status === 'failed') && !j.seenAt)
    }))
  }
}

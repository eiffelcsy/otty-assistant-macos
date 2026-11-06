import { randomUUID } from 'crypto'
import { nativeImage } from 'electron'
import type { AnswerLanguage, AppInfo, Capture, ChatEvent, ChatMessage, HomeLanguage, MemoryNote, QuickAction, SendOptions, StepApp, StepCard } from '../shared/types'
import { capturedText } from '../shared/captures'
import { mathTier } from '../shared/math'
import { chatStore, pruneOldChats, type Thread, type WriteFrom } from './store'
import { fileBudget, fitFiles, type FileOutput } from './files/budget'
import { takeFiles } from './files'
import { getStored } from './settings'
import { resolveLanguage, turnNote, withNote } from './language'
import { actionPrompt, explainPrompt, systemPrompt, titlePrompt } from './prompts'
import { createExplainCache, termsToWarm } from './explainCache'
import { toolDefs, type ToolOutcome } from './tools'
import { runLoop } from './loop'
import { instantAnswer } from './math'
import { act, isRisky } from './act'
import { stepCard } from './act/card'
import { urlsIn } from './knownUrls'
import { forget as forgetMemory, MEMORY_NOTE, memoryStore, observe, remember, undo, type LearnTurn } from './memory'
import { isKnownUrl } from './knownUrls'
import { activeProfile, activeProvider, FriendlyError, NoVisionError, type ContentPart } from './providers'

// The conversation: what's sent, what comes back and what's saved. Talking to the model service is `providers/`.

const MAX_TOOL_ROUNDS = 6

/** Tools whose results are someone else's words. */
const OUTSIDE_TOOLS = new Set(['search_web', 'read_page'])

/** Answers running at once. A fourth stops the oldest that isn't on show. */
const MAX_TURNS = 3

type Answer = Extract<ChatMessage, { role: 'assistant' }>

/** An answer in progress. It belongs to its chat, so moving to another chat leaves it running. */
interface LiveTurn {
  thread: Thread
  answerId: string
  abort: AbortController
  confirms: Map<string, (ok: boolean) => void>
  /** The confirm card on show, so coming back to the chat shows it again. */
  asking?: { confirmId: string; title: string; detail: string }
}

/** What a job needs from the chat that started it. */
export interface JobRequest {
  title: string
  brief: string
  sourceThread: string
  /** Addresses in the brief that the chat already knew. The brief itself is the model's words, so it proves nothing. */
  seedUrls: string[]
  language: AnswerLanguage
}

export interface SessionHooks {
  /** An answer started or ended. `unseen` means it finished in a chat that isn't on show. */
  onTurn?(unseen: boolean): void
  /** Starts a job. The user has already agreed. Resolves to words for the model, if it couldn't start. */
  startJob?(job: JobRequest): Promise<string | null>
}

/** Memory is a nice extra: it must never be the reason an answer fails. */
function safely<T>(fallback: T, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    console.error('Memory problem', err)
    return fallback
  }
}

/** What's sent with this question. An earlier note stays in the history, so if nothing's left to say, that has to be said. */
function memoryNote(question: string, app: string | null, history: Thread['history']): string {
  const { note, ids } = getStored().learn ? safely({ note: '', ids: [] as number[] }, () => memoryStore().forPrompt(question, app)) : { note: '', ids: [] }
  safely(undefined, () => ids.length && memoryStore().markUsed(ids))
  if (note) return note
  const told = history.some((m) => m.role === 'user' && JSON.stringify(m.content).includes(MEMORY_NOTE))
  return told ? `${MEMORY_NOTE}: nothing at the moment.]` : ''
}

interface Turn {
  /** What the user typed or tapped. */
  typed: string
  /** What the model is asked: `typed`, or a quick action's own prompt. */
  prompt: string
  action?: QuickAction
  captures: Capture[]
  app: AppInfo | null
  files: FileOutput[]
  language: AnswerLanguage
  home: HomeLanguage | null
}

function appLine(app: AppInfo | null): string {
  if (!app) return ''
  const where = [app.title && `“${app.title}”`, app.url && `(${app.url})`].filter(Boolean).join(' ')
  return `[I'm using ${app.name}${where ? `, on ${where}` : ''}.]\n\n`
}

/** "from Safari (“Pricing”)", for labelling one of several captures. */
function fromApp(app: AppInfo | null): string {
  if (!app) return ''
  return ` · from ${app.name}${app.title ? ` (“${app.title}”)` : ''}`
}

export function userContent(text: string, captures: Capture[], app: AppInfo | null, files: FileOutput[] = []): string | ContentPart[] {
  const fileText = files.map((f) => f.text + '\n\n').join('')
  const filePictures = files.flatMap((f) => (f.image ? [f.image] : []))
  const snips = captures.flatMap((c) => (c.context.kind === 'image' ? [c.context.dataUrl] : []))
  const pictures = [...snips, ...filePictures]
  let body: string

  if (captures.length <= 1) {
    // One capture keeps the wording models have seen since the start.
    const ctx = captures[0]?.context
    const prefix = appLine(captures[0]?.app ?? app) + fileText
    body = prefix + text
    if (ctx?.kind === 'text') {
      body = `${prefix}Here is the text I highlighted on my screen:\n"""\n${ctx.text}\n"""\n\n${text}`
    } else if (ctx?.kind === 'image') {
      const which = pictures.length > 1 ? 'The first picture' : 'This'
      body = `${prefix}${which} is ${ctx.wholeScreen ? 'a picture of my whole screen' : 'a snip of part of my screen'}.\n\n${text}`
    }
  } else {
    let picture = 0
    const blocks = captures.map((c, i) => {
      const label = `[Capture ${i + 1}${fromApp(c.app)}]`
      if (c.context.kind === 'text') return `${label} Text I highlighted:\n"""\n${c.context.text}\n"""`
      picture++
      return `${label} ${c.context.wholeScreen ? 'A picture of my whole screen' : 'A snip of part of my screen'}: picture ${picture}.`
    })
    body = `I've collected ${captures.length} things from my screen:\n\n${blocks.join('\n\n')}\n\n${fileText}${text}`
  }

  if (!pictures.length) return body
  return [...pictures.map((url): ContentPart => ({ type: 'image_url', image_url: { url } })), { type: 'text', text: body }]
}

export function titleFor(text: string, captures: Capture[], fileName?: string): string {
  const q = text.trim().replace(/[.?!]$/, '')
  const highlighted = capturedText(captures.slice(0, 1))
  const about = highlighted
    ? ` “${highlighted.replace(/\s+/g, ' ').slice(0, 40).trim()}…”`
    : fileName
      ? ` “${fileName}”`
      : ''
  const title = q + about
  return title.length > 80 ? title.slice(0, 79) + '…' : title
}

function newThread(): Thread {
  const now = Date.now()
  return { id: randomUUID(), title: 'New chat', createdAt: now, updatedAt: now, messages: [], history: [] }
}

export class ChatSession {
  /** The chat on show. */
  private thread = newThread()
  /** Answers in progress, by chat. */
  private live = new Map<string, LiveTurn>()
  /** Each chat's last turn, so a stopped one can finish cleaning up before the next adds to its history. */
  private queues = new Map<string, Promise<void>>()
  /** Chats the user deleted while a turn was still running: that turn must not write them back. */
  private forgotten = new Set<string>()
  /** What went wrong with a step, for the model to hear with the next question. */
  private stepNotes = new Map<string, string[]>()

  constructor(
    private emit: (e: ChatEvent) => void,
    private hooks: SessionHooks = {}
  ) {}

  get threadId(): string {
    return this.thread.id
  }

  /** Only the chat on show reaches the windows. */
  private tell(thread: Thread, e: ChatEvent): void {
    if (thread.id === this.thread.id) this.emit(e)
  }

  /** Answers in progress, for Activity. */
  running(): { threadId: string; title: string; shown: boolean }[] {
    return [...this.live.values()].map((t) => ({ threadId: t.thread.id, title: t.thread.title, shown: t.thread.id === this.thread.id }))
  }

  /** Whether this chat teaches Otty anything. Memories are still used in its answers either way. */
  private learns(thread: Thread): boolean {
    return Boolean(getStored().learn) && thread.learn !== false
  }

  /** "Don't learn from this chat". */
  setLearn(on: boolean): void {
    const thread = this.thread
    if (on) delete thread.learn
    else thread.learn = false
    this.persist(thread, { messages: thread.messages.length, history: thread.history.length })
    this.emit({ type: 'learn', on })
  }

  /** Undo on a Noted line. Only the open chat shows one, so that's where it lives. */
  undoMemory(answerId: string, memoryId: number): void {
    const thread = this.thread
    const at = thread.messages.findIndex((m) => m.id === answerId)
    const answer = thread.messages[at]
    if (answer?.role !== 'assistant') return
    const note = answer.memories?.find((n) => n.memoryId === memoryId && !n.undone)
    if (!note) return
    const undone = safely(note, () => undo(memoryStore(), note))
    answer.memories = answer.memories!.map((n) => (n === note ? undone : n))
    this.persist(thread, { messages: at, history: thread.history.length })
    this.emit({ type: 'memory', id: answerId, note: undone })
  }

  /** Starts a new conversation. The old one stays in Recent chats, and carries on if it's still answering. */
  reset(): void {
    this.thread = newThread()
  }

  /** Reopens a saved chat and shows it. Returns false if it no longer exists. */
  async open(id: string, focusMessageId?: string): Promise<boolean> {
    const turn = this.live.get(id)
    if (turn) {
      this.show(turn.thread, focusMessageId, turn)
      return true
    }
    if (this.thread.id === id) {
      this.show(this.thread, focusMessageId)
      return true
    }
    const saved = await chatStore().get(id)
    if (!saved) return false
    this.show(structuredClone(saved), focusMessageId)
    return true
  }

  /** Shows a chat that may not be saved, such as a report with "Remember my chats" off. */
  showThread(thread: Thread): void {
    this.show(structuredClone(thread))
  }

  private show(thread: Thread, focusMessageId?: string, turn?: LiveTurn): void {
    this.thread = thread
    this.emit({
      type: 'load',
      messages: thread.messages,
      focusMessageId,
      ...(thread.learn === false ? { learn: false as const } : {}),
      ...(turn ? { streaming: turn.answerId } : {})
    })
    if (turn?.asking) this.emit({ type: 'confirm', id: turn.answerId, ...turn.asking })
  }

  /** The user deleted this chat (or all of them): stop and never save it again. */
  forget(id: string): void {
    this.forgotten.add(id)
    this.stopChat(id)
    if (this.thread.id === id) this.reset()
  }

  /** Saves a turn's rows, if the user keeps chats. Never throws: a failed save shouldn't break the answer. */
  private persist(thread: Thread, from: WriteFrom): void {
    if (!getStored().rememberChats || this.forgotten.has(thread.id)) return
    chatStore()
      .write(thread, from)
      .catch((err) => console.error('Could not save chat', err))
  }

  /** Stops the answer on show. */
  stop(): void {
    this.stopChat(this.thread.id)
  }

  stopChat(id: string): void {
    const turn = this.live.get(id)
    if (!turn) return
    turn.abort.abort()
    for (const resolve of turn.confirms.values()) resolve(false)
    turn.confirms.clear()
    turn.asking = undefined
  }

  respondConfirm(id: string, allow: boolean): void {
    for (const turn of this.live.values()) {
      const resolve = turn.confirms.get(id)
      if (!resolve) continue
      turn.confirms.delete(id)
      turn.asking = undefined
      resolve(allow)
    }
  }

  /** `text` is what the user sees; a quick action swaps in its own prompt for the model. */
  send(
    text: string,
    captures: Capture[],
    app: AppInfo | null,
    opts: Pick<SendOptions, 'language' | 'action' | 'files'> = {}
  ): Promise<void> {
    const thread = this.thread
    // A new question in the same chat replaces its answer: one history can't take two turns at once.
    this.stopChat(thread.id)
    this.makeRoom(thread.id)
    const home = getStored().homeLanguage
    const language = resolveLanguage({
      typed: opts.action ? '' : text,
      picked: opts.language,
      action: opts.action,
      selection: capturedText(captures) || undefined,
      home
    })
    const prompt = opts.action ? actionPrompt(opts.action, language, home) : text
    const prepared = takeFiles(opts.files)
    const budget = fileBudget(activeProfile().contextTokens)
    const fitted = fitFiles(prepared.map((p) => ({ name: p.meta.name, doc: p.doc, image: p.image?.dataUrl })), budget)
    const files = prepared.map((p, i) => ({ ...p.meta, note: fitted[i].note }))
    const userMsg: Extract<ChatMessage, { role: 'user' }> = {
      id: randomUUID(),
      role: 'user',
      text,
      captures,
      app: captures.length ? null : app,
      language,
      at: Date.now(),
      ...(files.length ? { files } : {})
    }
    if (!thread.messages.length) {
      thread.title = titleFor(text, captures, files[0]?.name)
      const where = captures[0]?.app ?? app
      if (where) thread.app = where.name
    }
    thread.messages.push(userMsg)
    thread.updatedAt = Date.now()
    this.tell(thread, { type: 'user', ...userMsg })

    // Let a stopped turn finish cleaning up its own history before this one adds to it.
    const turn: Turn = { typed: text, prompt, action: opts.action, captures, app, files: fitted, language, home }
    const running = (this.queues.get(thread.id) ?? Promise.resolve()).then(() => this.answer(thread, turn))
    this.queues.set(thread.id, running)
    // Save the question now, so a crash mid-answer keeps it. setImmediate runs after the request has been sent,
    // so the write is never on the way to the first token.
    const at = thread.messages.length - 1
    setImmediate(() => this.persist(thread, { messages: at, history: thread.history.length }))
    return running.finally(() => {
      if (this.queues.get(thread.id) === running) this.queues.delete(thread.id)
    })
  }

  private makeRoom(keep: string): void {
    const others = [...this.live.values()].filter((t) => t.thread.id !== keep && t.thread.id !== this.thread.id)
    if (this.live.size >= MAX_TURNS && others[0]) this.stopChat(others[0].thread.id)
  }

  /** A question that's only a sum is answered right here. Anything else goes to the model. */
  private async answer(thread: Thread, turn: Turn): Promise<void> {
    const tier = mathTier(turn.typed, turn.captures.length > 0)
    const local = tier === 'expression' && !turn.action && !turn.captures.length && !turn.files.length
    const calc = local ? await instantAnswer(turn.typed).catch(() => null) : null
    if (calc) return this.answerLocally(thread, turn, calc)
    // "Think deeper" means always think. Otherwise only a real problem is worth the wait.
    const reasons = (tier === 'problem' || turn.action === 'working') && !getStored().thinking
    return this.run(thread, turn, reasons ? 'normal' : undefined)
  }

  /** Saved like any answer, so the next question can follow on from it. No request, so it works offline. */
  private answerLocally(thread: Thread, turn: Turn, calc: NonNullable<Answer['calc']>): void {
    const id = randomUUID()
    const text = `**${calc.result}**`
    const answer: Answer = { id, role: 'assistant', text, tools: [], calc, language: turn.language, at: Date.now() }
    const answerAt = thread.messages.push(answer) - 1
    const turnStart = thread.history.length
    thread.history.push({ role: 'user', content: withNote(turn.typed, turnNote(turn.language, turn.home)) })
    thread.history.push({ role: 'assistant', content: `${calc.expression} = ${calc.result}` })
    this.tell(thread, { type: 'start', id, language: turn.language })
    this.tell(thread, { type: 'calc', id, ...calc })
    this.noticeHabits(thread, turn, answer)
    this.tell(thread, { type: 'done', id })
    thread.updatedAt = Date.now()
    this.persist(thread, { messages: answerAt, history: turnStart })
  }

  /** Adds a Noted line to an answer. */
  private note(thread: Thread, answer: Answer, note: MemoryNote): void {
    answer.memories = [...(answer.memories ?? []), note]
    this.tell(thread, { type: 'memory', id: answer.id, note })
  }

  /** Counts this question towards the user's habits. A habit that's new gets shown, like anything else Otty learns. */
  private noticeHabits(thread: Thread, turn: Turn, answer: Answer): void {
    if (!this.learns(thread)) return
    const app = (turn.captures[0]?.app ?? turn.app)?.name ?? null
    const fresh = safely([], () => observe(memoryStore(), { app, language: turn.language, action: turn.action, typed: turn.typed }))
    for (const m of fresh) this.note(thread, answer, { memoryId: m.id, text: m.text, action: 'added' })
  }

  private async run(thread: Thread, turn: Turn, reasoning?: 'normal'): Promise<void> {
    const { prompt: text, captures, app, files, language, home } = turn
    const id = randomUUID()
    const abort = new AbortController()
    const history = thread.history
    const answer: Answer = {
      id,
      role: 'assistant',
      text: '',
      tools: [],
      language,
      at: Date.now()
    }
    const answerAt = thread.messages.push(answer) - 1
    const live: LiveTurn = { thread, answerId: id, abort, confirms: new Map() }
    this.live.set(thread.id, live)
    this.hooks.onTurn?.(false)
    let finished = false

    // reasoning_content is only meaningful within the turn that produced it.
    for (const m of history) if (m.role === 'assistant') delete m.reasoning_content
    const turnStart = history.length
    // Saved as sent: nothing already sent may change, or DeepSeek's cache misses from that point on.
    const where = (captures[0]?.app ?? app)?.name ?? null
    const known = memoryNote([turn.typed, capturedText(captures)].join(' '), where, history)
    const stepNotes = this.stepNotes.get(thread.id) ?? []
    this.stepNotes.delete(thread.id)
    const note = [turnNote(language, home), known, ...stepNotes].filter(Boolean).join('\n')
    history.push({ role: 'user', content: withNote(userContent(text, captures, app, files), note) })
    const system = systemPrompt(home, activeProfile().web !== 'off', Boolean(getStored().learn))
    this.tell(thread, { type: 'start', id, language })
    this.noticeHabits(thread, turn, answer)

    // What came in from outside this turn, so that nothing in it can become a memory.
    const heard: LearnTurn = {
      typed: turn.typed,
      outside: [capturedText(captures), ...files.map((f) => f.text)].join('\n'),
      hadOutside: captures.length > 0 || files.length > 0
    }
    const place = { chatId: thread.id, messageId: id, inferred: 0 }
    const learning = (act: () => ReturnType<typeof remember>) => {
      if (!this.learns(thread)) return { result: 'Not saved: the user turned learning off for this chat. Don’t say it was saved.', status: 'denied' as const }
      const { outcome, note } = safely({ outcome: { result: 'That didn’t work.', status: 'error' as const } }, act)
      if (note) this.note(thread, answer, note)
      return outcome
    }

    try {
      await runLoop({
        provider: activeProvider,
        system,
        history,
        tools: toolDefs,
        context: {
          confirm: (title, detail) => this.askConfirm(live, title, detail),
          knownUrl: (url) => isKnownUrl(url, history),
          showSteps: (args) => this.showSteps(thread, answer, args, captures[0]?.app ?? app),
          startJob: (args) => this.offerJob(live, args, language),
          learn: {
            remember: (args) => learning(() => remember(memoryStore(), args, heard, place)),
            forget: (args) => learning(() => forgetMemory(memoryStore(), args, heard))
          }
        },
        maxRounds: MAX_TOOL_ROUNDS,
        signal: abort.signal,
        reasoning,
        onEvent: (e) => {
          if (e.type === 'text') {
            answer.text += e.text
            this.tell(thread, { type: 'delta', id, text: e.text })
          }
          if (e.type === 'tool-result' && OUTSIDE_TOOLS.has(e.name)) {
            heard.hadOutside = true
            heard.outside += `\n${e.outcome.result}`
          }
          if (e.type === 'search') {
            heard.hadOutside = true
            const chip = { callId: `${id}-search-${e.round}`, label: 'Searching the web', icon: 'search' }
            if (e.status === 'done') answer.tools = [...answer.tools.filter((t) => t.callId !== chip.callId), { ...chip, status: 'done' }]
            this.tell(thread, { type: 'tool', id, ...chip, status: e.status })
          }
          if (e.type === 'tool') {
            const { type: _type, ...chip } = e
            if (chip.status !== 'running') answer.tools = [...answer.tools.filter((t) => t.callId !== chip.callId), chip]
            this.tell(thread, { type: 'tool', id, ...chip })
          }
        }
      })
      this.tell(thread, { type: 'done', id })
      finished = true
    } catch (err) {
      // Drop the unfinished turn so a dangling tool call can't break the next request.
      history.length = turnStart
      if ((err as Error).name === 'AbortError') {
        this.tell(thread, { type: 'done', id })
      } else {
        const message = err instanceof FriendlyError ? err.message : 'Oops — something unexpected happened. Please try again.'
        if (!(err instanceof FriendlyError)) console.error(err)
        answer.error = message
        this.tell(thread, { type: 'error', id, message })
      }
    } finally {
      if (this.live.get(thread.id) === live) this.live.delete(thread.id)
      this.hooks.onTurn?.(finished && thread.id !== this.thread.id)
      thread.updatedAt = Date.now()
      // Only this turn's rows: the cost doesn't grow with the length of the chat.
      this.persist(thread, { messages: answerAt, history: turnStart })
      void pruneOldChats().catch((err) => console.error('Could not forget old chats', err))
      if (finished) this.afterAnswer(thread, answer, answerAt === 1)
    }
  }

  /** Background work once an answer is complete. None of it touches the chat's history. */
  private afterAnswer(thread: Thread, answer: Answer, first: boolean): void {
    for (const term of termsToWarm(answer.text)) void explainTerm(term, answer.text, answer.language ?? 'en')
    if (first) void this.writeTitle(thread, answer.text)
  }

  /** The instant title stays if this fails. `thread` is the chat the turn ran on, which may not be the current one. */
  private async writeTitle(thread: Thread, answer: string): Promise<void> {
    if (!getStored().rememberChats) return
    const asked = thread.messages[0]
    if (asked?.role !== 'user') return
    try {
      const question = [asked.text, capturedText(asked.captures)].filter(Boolean).join('\n')
      const { text } = await activeProvider().complete({ messages: [{ role: 'user', content: titlePrompt(question, answer) }], maxTokens: 24, reasoning: 'least' })
      const title = cleanTitle(text)
      if (!title) return
      thread.title = title
      this.persist(thread, { messages: thread.messages.length, history: thread.history.length })
    } catch {
      /* the instant title is fine */
    }
  }

  private askConfirm(turn: LiveTurn, title: string, detail: string): Promise<boolean> {
    const confirmId = randomUUID()
    return new Promise((resolve) => {
      turn.confirms.set(confirmId, resolve)
      turn.asking = { confirmId, title, detail }
      this.tell(turn.thread, { type: 'confirm', id: turn.answerId, confirmId, title, detail })
    })
  }

  /** The model only asks. The card is what starts a job, so a hostile page can't. */
  private async offerJob(turn: LiveTurn, args: Record<string, unknown>, language: AnswerLanguage): Promise<ToolOutcome> {
    const title = String(args.title ?? '').trim().slice(0, 80)
    const brief = String(args.brief ?? '').trim().slice(0, 2_000)
    if (!title || !brief || !this.hooks.startJob) return { result: 'That needs a title and a brief.', status: 'error' }
    const detail = `${brief}\n\nOtty will look this up on public web pages using your AI key, and only this text goes with it.`
    if (!(await this.askConfirm(turn, 'Look into this in the background?', detail))) return { result: 'The user declined.', status: 'denied' }
    const thread = turn.thread
    const seedUrls = urlsIn(brief).filter((url) => isKnownUrl(url, thread.history))
    const problem = await this.hooks.startJob({ title, brief, sourceThread: thread.id, seedUrls, language })
    return problem ? { result: problem, status: 'error' } : { result: 'Started. The user will find the report in Activity.', status: 'done' }
  }

  /** The card under an answer. `replaces` puts right the chat's last one, after the user got stuck. */
  private showSteps(thread: Thread, answer: Answer, args: Record<string, unknown>, app: AppInfo | null): ToolOutcome {
    const earlier = [...thread.messages].reverse().find((m): m is Answer => m.role === 'assistant' && !!m.steps)
    const where: StepApp | null = app ? { name: app.name, bundleId: app.bundleId, pid: app.pid } : (earlier?.steps?.app ?? null)
    const card = stepCard(args, where)
    if (!card) return { result: 'There were no steps to show.', status: 'error' }
    for (const step of card.steps) if (step.action && isRisky(step.action)) step.risky = true
    const target = args.replaces && earlier ? earlier : answer
    target.steps = card
    this.tell(thread, { type: 'steps', id: target.id, card })
    if (target !== answer) this.persist(thread, { messages: thread.messages.indexOf(target), history: thread.history.length })
    return { result: 'Shown to the user.', status: 'done' }
  }

  private card(answerId: string, index: number): { at: number; card: StepCard } | null {
    const at = this.thread.messages.findIndex((m) => m.id === answerId)
    const answer = this.thread.messages[at]
    return answer?.role === 'assistant' && answer.steps?.steps[index] ? { at, card: answer.steps } : null
  }

  private saveCard(answerId: string, at: number, card: StepCard): void {
    this.persist(this.thread, { messages: at, history: this.thread.history.length })
    this.emit({ type: 'steps', id: answerId, card })
  }

  /** The user pressed a step's button. The step is looked up here, so only what's on the card can run. */
  async runStep(answerId: string, index: number, sure = false): Promise<void> {
    const found = this.card(answerId, index)
    const step = found?.card.steps[index]
    if (!found || !step?.action || step.manual) return
    if (isRisky(step.action) && !sure) return
    const thread = this.thread
    const result = await act(step.action, found.card.app ?? null)
    step.note = result.message
    if (result.ok) step.done = true
    if (result.manual) step.manual = true
    if (!result.ok) {
      const notes = this.stepNotes.get(thread.id) ?? []
      this.stepNotes.set(thread.id, [...notes, `[The step “${step.text}” didn't work: ${result.message}]`])
    }
    if (thread === this.thread) this.saveCard(answerId, found.at, found.card)
  }

  tickStep(answerId: string, index: number, done: boolean): void {
    const found = this.card(answerId, index)
    if (!found) return
    found.card.steps[index].done = done
    this.saveCard(answerId, found.at, found.card)
  }

  /** "I'm stuck": the words of the follow-up. */
  stuckQuestion(answerId: string, index: number): string | null {
    const found = this.card(answerId, index)
    return found && `I’m on step ${index + 1} (“${found.card.steps[index].text}”) and I’m stuck.`
  }
}

/** An explanation, or a failure with friendly words. Only real explanations are kept. */
async function fetchExplanation(term: string, around: string, language: AnswerLanguage): Promise<string> {
  const { text } = await activeProvider().complete({
    messages: [{ role: 'user', content: explainPrompt(term, around, language, getStored().homeLanguage) }],
    maxTokens: 300,
    reasoning: 'least'
  })
  if (!text) throw new FriendlyError('Hmm, Otty couldn’t think of a simple explanation. Try asking in the chat!')
  return text
}

const explanations = createExplainCache(fetchExplanation)

export async function explainTerm(term: string, around: string, language: AnswerLanguage = 'en'): Promise<string> {
  try {
    return await explanations(term, around, language)
  } catch (err) {
    return err instanceof FriendlyError ? err.message : 'Otty couldn’t fetch that explanation right now.'
  }
}

/** One line, with no quotes or closing full stop, or nothing if there's no usable title. */
export function cleanTitle(raw: string): string {
  const line = raw.trim().split('\n')[0].trim()
  const bare = line.replace(/^title:\s*/i, '').replace(/^["'“”‘’「」『』]+|["'“”‘’「」『』.。]+$/g, '').trim()
  return bare.length > 60 ? `${bare.slice(0, 59).trim()}…` : bare
}

/** Sends a small grey square. True = the model can see, false = it can't, null = couldn't tell. */
async function canSeeImages(): Promise<boolean | null> {
  const png = nativeImage.createFromBitmap(Buffer.alloc(32 * 32 * 4, 200), { width: 32, height: 32 }).toPNG()
  try {
    await activeProvider().complete({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
            { type: 'text', text: 'What colour is this? One word.' }
          ]
        }
      ],
      maxTokens: 10
    })
    return true
  } catch (err) {
    return err instanceof NoVisionError ? false : null
  }
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const reply = await activeProvider().complete({ messages: [{ role: 'user', content: 'Say hi in 3 words.' }], maxTokens: 20 })
    const model = String(reply.model || getStored().model)
    const vision = await canSeeImages()
    const message =
      vision === false
        ? `Connected to ${model}! Heads up: this model can’t look at screen snips, but questions about text work fine.`
        : `Connected to ${model}! Otty is ready to help.`
    return { ok: true, message }
  } catch (err) {
    return { ok: false, message: err instanceof FriendlyError ? err.message : 'Could not connect.' }
  }
}

import { randomUUID } from 'crypto'
import { nativeImage } from 'electron'
import type {
  AnswerLanguage,
  AppInfo,
  Capture,
  ChatEvent,
  ChatMessage,
  ConfirmCard,
  EditDraft,
  HomeLanguage,
  MemoryNote,
  QuickAction,
  RewindPlan,
  UsedMemory,
  SendOptions,
  StepApp,
  StepCard,
  Twist
} from '../shared/types'
import { capturedText } from '../shared/captures'
import { HIDDEN, maskSecrets } from '../shared/secrets'
import { questionWhat } from './sent'
import { jobCard, receiptFor } from './cards'
import { tablesIn, type Table } from '../shared/table'
import { buildChart } from './chart'
import { mathTier } from '../shared/math'
import { turnHints } from './hints'
import { describeWhen, parseDue } from '../shared/when'
import { firstRun, parseRepeat, repeatWords, runsPerMonth, type Repeat } from '../shared/repeat'
import type { ChatStore, Thread, WriteFrom } from './store'
import { fileBudget, fitFiles, sampleText, type FileOutput } from './files/budget'
import { takeFiles } from './files'
import { getStored, type StoredSettings } from './settings'
import { resolveLanguage, turnNote, withNote } from './language'
import { actionPrompt, explainPrompt, systemPrompt, titlePrompt } from './prompts'
import { createExplainCache, termsToWarm } from './explainCache'
import { toolDefs, type MacHands, type ToolOutcome } from './tools'
import { CHAT_TOOLS, LASTING_TOOLS, OUTSIDE_TOOLS, type RunTaint } from './toolSafety'
import { runLoop } from './loop'
import { begin, canUndo, type Ledger } from './ledger'
import { count } from './usage'
import { instantAnswer } from './math'
import { act, isRisky } from './act'
import { stepCard } from './act/card'
import { urlsIn } from './knownUrls'
import { forget as forgetMemory, MEMORY_NOTE, observe, remember, undo, type LearnTurn, type MemoryStore } from './memory'
import { isKnownUrl } from './knownUrls'
import { activeProvider, FriendlyError, NoVisionError, type ContentPart, type Profile, type Provider, type SentTag } from './providers'
import { liveDeps } from './sessionDeps'

// The conversation: what's sent, what comes back and what's saved. Talking to the model service is `providers/`.

const MAX_TOOL_ROUNDS = 6

/** Answers running at once. A fourth stops the oldest that isn't on show. */
const MAX_TURNS = 3

type Answer = Extract<ChatMessage, { role: 'assistant' }>

/** An answer in progress. It belongs to its chat, so moving to another chat leaves it running. */
interface LiveTurn {
  thread: Thread
  answerId: string
  abort: AbortController
  answer: Answer
  /** Each waiting card's answer. `why` says why it ended, when it wasn't the user's choice. */
  confirms: Map<string, (ok: boolean, why?: string) => void>
  /** The confirm card on show, so coming back to the chat shows it again. */
  asking?: { confirmId: string; card: ConfirmCard }
  /** The receipt of a card just allowed, which gets its Undo once the tool says how (D-60). */
  undoable?: { at: number; kind: 'reminder' | 'job' }
  /** The user pressed Stop, as opposed to the turn giving way to a new question. */
  stopped?: boolean
}

/** What a job needs from the chat that started it. */
export interface JobRequest {
  /** Chosen here, so the answer can point at the job it started. */
  id: string
  title: string
  brief: string
  sourceThread: string
  /** Addresses in the brief that the chat already knew. The brief itself is the model's words, so it proves nothing. */
  seedUrls: string[]
  language: AnswerLanguage
  /** Run it then, not now (ms since epoch). */
  dueAt?: number
  /** And again after that (D-34). Only ever from a card the user agreed to. */
  repeat?: Repeat
}

export interface SessionHooks {
  /** An answer started or ended. `unseen` means it finished in a chat that isn't on show. */
  onTurn?(unseen: boolean): void
  /** Starts a job. The user has already agreed. Resolves to words for the model, if it couldn't start. */
  startJob?(job: JobRequest): Promise<string | null>
  /** One line for the job card about what a look like this costs and where it stops. */
  jobCost?(): Promise<string>
  /** True once this month's limit is reached (D-33): then nothing is fetched ahead in the background. */
  overCap?(): boolean
  /** Whether a look this chat started is still to do or under way, so Try again can offer to stop it (D-36). */
  jobLive?(id: string): Promise<boolean>
  /** Takes back a look whose answer is being replaced: gone if it never started, stopped if it had. */
  withdrawJob?(id: string): Promise<void>
  /** The first answer in the home language, so the message box can start offering the language button. */
  onHomeUsed?(): void
}


/**
 * Try again with a twist (D-58): one line after the question, as the turn's other notes are, so everything before it
 * is sent as it was and the cache holds.
 */
const TWIST: Record<Twist, string> = {
  shorter: 'Answer this again, shorter than last time.',
  simpler: 'Answer this again, in simpler words than last time.',
  detail: 'Answer this again, in more detail than last time.'
}

/** What Undo on a Noted line would do, said as an undo. */
const UNDO_NOTE: Record<MemoryNote['action'], (text: string) => string> = {
  added: (text) => `Forget “${text}”`,
  updated: (text) => `Undo the change to “${text}”`,
  forgotten: (text) => `Remember “${text}” again`
}

/** The words of a message as the model got it, pictures left out. */
const contentText = (content: string | ContentPart[]): string =>
  typeof content === 'string' ? content : content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')

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
function memoryNote(memory: MemoryStore | null, question: string, app: string | null, history: Thread['history']): { note: string; used: UsedMemory[] } {
  const none = { note: '', ids: [] as number[], matched: [] as { id: number; text: string }[] }
  const { note, ids, matched } = memory ? safely(none, () => memory.forPrompt(question, app)) : none
  safely(undefined, () => ids.length && memory?.markUsed(ids))
  const used = matched.slice(0, 2).map((m) => ({ memoryId: m.id, text: m.text }))
  if (note) return { note, used }
  const told = history.some((m) => m.role === 'user' && JSON.stringify(m.content).includes(MEMORY_NOTE))
  return { note: told ? `${MEMORY_NOTE}: nothing at the moment.]` : '', used }
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
  /** Keys hidden in the typed words and highlighted text. Files carry their own count. */
  hidden: number
  /** What went with it, for "What left your Mac". */
  sent: string
  /**
   * Try again (D-36): the question is already in the history exactly as it was sent, so it's sent again unchanged
   * and the cache still holds. `used` and `outside` are what the first try had.
   */
  resend?: { used: UsedMemory[]; outside: string }
}

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Hides keys in what the user typed and highlighted before anything is sent or saved (D-32). Highlighted text gets
 * the full check; typed words only lose well-known key shapes, because "my password is…" may be meant.
 */
export function hideKeys(typed: string, captures: Capture[]): { typed: string; captures: Capture[]; hidden: number; lines: string[] } {
  const own = maskSecrets(typed, { shapesOnly: true, lines: true })
  let hidden = own.hidden
  const lines = [...(own.lines ?? [])]
  const masked = captures.map((c): Capture => {
    if (c.context.kind !== 'text') return c
    const m = maskSecrets(c.context.text, { lines: true })
    hidden += m.hidden
    lines.push(...(m.lines ?? []))
    return m.hidden ? { ...c, context: { ...c.context, text: m.text } } : c
  })
  return { typed: own.text, captures: masked, hidden, lines }
}

/** Told to the model, so it doesn't ask what the gap is or guess at it. */
const hiddenNote = (n: number): string =>
  n ? `[Otty hid ${n === 1 ? 'something that looked like a key or password' : `${n} things that looked like keys or passwords`} before sending: they show as ${HIDDEN}. Don’t guess what they were.]` : ''

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

/** Everything a chat session reaches outside itself (D-45). The app's are in `sessionDeps.ts`. */
export interface SessionDeps {
  settings(): StoredSettings
  chats(): ChatStore
  pruneChats(): Promise<number>
  memory(): MemoryStore
  profile(): Profile
  provider(sent: SentTag): Provider
  /** What Otty changed (D-46), or null when nothing keeps it. */
  ledger(): Ledger | null
  /** Keeps a message's hidden lines in memory, for "Otty hid 1 key" (D-40). */
  keepHidden(id: string, lines: string[]): void
  /** How this chat's tools reach the Mac: open a page, copy, add a reminder. */
  mac: MacHands
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
  /**
   * Tables attached or highlighted in each chat, newest first, for make_chart (D-35). Kept in memory only, like the
   * files themselves: after a restart, Otty asks for the file again rather than charting from a summary.
   */
  private tables = new Map<string, Table[]>()
  /** Words left in a chat's message box, by chat (D-62). Memory only: a restart starts each box empty. */
  private drafts = new Map<string, string>()

  constructor(
    private emit: (e: ChatEvent) => void,
    private hooks: SessionHooks = {},
    private deps: SessionDeps = liveDeps
  ) {}

  get threadId(): string {
    return this.thread.id
  }

  /** Only the chat on show reaches the windows. */
  private tell(thread: Thread, e: ChatEvent): void {
    if (thread.id === this.thread.id) this.emit(e)
  }

  /** Cards waiting for an answer, for the Logbook's Needs you (D-63). */
  asking(): { threadId: string; heading: string }[] {
    return [...this.live.values()].flatMap((t) => (t.asking ? [{ threadId: t.thread.id, heading: t.asking.card.title }] : []))
  }

  /** Answers in progress, for Activity. */
  running(): { threadId: string; title: string; shown: boolean }[] {
    return [...this.live.values()].map((t) => ({ threadId: t.thread.id, title: t.thread.title, shown: t.thread.id === this.thread.id }))
  }

  /** Whether this chat teaches Otty anything. Memories are still used in its answers either way. */
  private learns(thread: Thread): boolean {
    return Boolean(this.deps.settings().learn) && thread.learn !== false
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
    const undone = safely(note, () => undo(this.deps.memory(), note))
    if (undone.undone) this.deps.ledger()?.markUndone(thread.id, 'memory', String(memoryId))
    answer.memories = answer.memories!.map((n) => (n === note ? undone : n))
    this.persist(thread, { messages: at, history: thread.history.length })
    this.emit({ type: 'memory', id: answerId, note: undone })
  }

  /**
   * The chat on show's latest turn, if `messageId` is its question or answer. Only the latest can be taken back:
   * cutting the history there leaves a prefix of what was sent, so the cache still holds (D-36).
   */
  private latestTurn(messageId: string) {
    const thread = this.thread
    const userAt = thread.messages.map((m) => m.role).lastIndexOf('user')
    const historyAt = thread.history.map((m) => m.role).lastIndexOf('user')
    const user = thread.messages[userAt]
    if (user?.role !== 'user' || historyAt < 0 || this.live.has(thread.id)) return null
    if (!thread.messages.slice(userAt).some((m) => m.id === messageId)) return null
    const answers = thread.messages.slice(userAt + 1).filter((m): m is Answer => m.role === 'assistant')
    return { thread, user, userAt, historyAt, answers }
  }

  /** What Try again or Edit would take back, so the user decides before the answer goes. */
  async rewindPlan(messageId: string): Promise<RewindPlan | null> {
    const turn = this.latestTurn(messageId)
    if (!turn) return null
    const live = (id: string) => this.hooks.jobLive?.(id).catch(() => false) ?? false
    const rows = this.deps.ledger()?.forAnswers(turn.thread.id, turn.answers.map((a) => a.id)).filter((r) => r.status === 'done' && !r.undoneAt)
    // D-46: what the ledger wrote down. A chat answered before it had one keeps the answer's own fields.
    if (rows?.length) {
      const memories = rows.filter((r) => r.undo === 'memory' && r.ref).map((r) => ({ id: `memory:${r.answerId}:${r.ref}`, label: r.undoLabel ?? r.summary }))
      const reminders = rows.filter((r) => r.undo === 'reminder' && r.ref).map((r) => ({ id: `reminder:${r.ref}`, label: r.undoLabel ?? r.summary }))
      const jobs = []
      for (const r of rows) if (r.undo === 'job' && r.ref && (await live(r.ref))) jobs.push({ id: `job:${r.ref}`, label: r.undoLabel ?? r.summary })
      const steps = rows.some((r) => r.tool.startsWith('step:')) ? ['Steps you ran from the card stay done.'] : []
      const lasting = rows.filter((r) => r.undo === 'none' && !r.tool.startsWith('step:')).map((r) => r.summary)
      return { undo: [...memories, ...reminders, ...jobs], lasting: [...lasting, ...steps] }
    }
    const undo: RewindPlan['undo'] = []
    const lasting: string[] = []
    for (const a of turn.answers) {
      for (const n of a.memories ?? []) if (!n.undone) undo.push({ id: `memory:${a.id}:${n.memoryId}`, label: UNDO_NOTE[n.action](n.text) })
      for (const j of a.jobs ?? []) if (await live(j.id)) undo.push({ id: `job:${j.id}`, label: `Stop looking into “${j.title}”` })
      lasting.push(...(a.lasting ?? []))
      if (a.steps?.steps.some((st) => st.done && st.action)) lasting.push('Steps you ran from the card stay done.')
    }
    return { undo, lasting }
  }

  /**
   * Takes back the latest turn (D-36). Ticked undos run first; then the answer goes from the chat, the history and
   * the saved rows. Try again sends the same question again, byte for byte. Edit removes the question too and
   * hands it back for the box. Nothing runs while the turn is still answering.
   */
  async rewind(messageId: string, undoIds: string[], mode: 'retry' | 'edit', twist?: Twist): Promise<EditDraft | null> {
    const turn = this.latestTurn(messageId)
    if (!turn || (mode === 'retry' && turn.answers.some((a) => a.calc))) return null
    const { thread, user, userAt, historyAt, answers } = turn
    const wanted = new Set(undoIds)
    for (const a of answers) {
      for (const n of a.memories ?? []) {
        if (n.undone || !wanted.has(`memory:${a.id}:${n.memoryId}`)) continue
        safely(undefined, () => void undo(this.deps.memory(), n))
        this.deps.ledger()?.markUndone(thread.id, 'memory', String(n.memoryId))
      }
      for (const j of a.jobs ?? []) {
        if (!wanted.has(`job:${j.id}`)) continue
        await this.hooks.withdrawJob?.(j.id).catch((err) => console.error('Could not stop a look', err))
        this.deps.ledger()?.markUndone(thread.id, 'job', j.id)
      }
    }
    // Only a reminder this turn's ledger rows name: the renderer can't make Otty remove any other.
    const reminders = (this.deps.ledger()?.forAnswers(thread.id, answers.map((a) => a.id)) ?? []).filter((r) => r.undo === 'reminder' && r.ref && !r.undoneAt)
    for (const ref of reminders.flatMap((r) => (wanted.has(`reminder:${r.ref}`) ? [r.ref!] : []))) {
      try {
        await this.deps.mac.unremind(ref)
        this.deps.ledger()?.markUndone(thread.id, 'reminder', ref)
      } catch (err) {
        console.error('Could not remove a reminder', err)
      }
    }
    const asked = thread.history[historyAt]
    if (mode === 'edit' && user.text.trim()) this.drafts.set(thread.id, user.text)
    const keep = mode === 'retry' ? 1 : 0
    thread.messages.length = userAt + keep
    thread.history.length = historyAt + keep
    thread.updatedAt = Date.now()
    if (thread.messages.length) this.persist(thread, { messages: thread.messages.length, history: thread.history.length })
    else if (this.deps.settings().rememberChats) void this.deps.chats().delete(thread.id).catch((err) => console.error('Could not remove an emptied chat', err))
    this.show(thread)

    if (mode === 'edit') {
      // Saved chats keep no pictures, so a snip from before a restart can't come back.
      const captures = user.captures.filter((c) => c.context.kind === 'text' || c.context.dataUrl)
      return { text: user.text, captures, files: (user.files ?? []).map((f) => f.name) }
    }

    const typed = user.text
    const outside = contentText(asked.role === 'user' ? asked.content : '').replace(typed, '')
    if (twist && asked.role === 'user') asked.content = withNote(asked.content, TWIST[twist])
    const again: Turn = {
      typed,
      prompt: '',
      captures: user.captures,
      app: user.app,
      files: [],
      language: user.language ?? 'en',
      home: this.deps.settings().homeLanguage,
      hidden: user.hidden ?? 0,
      sent: questionWhat({
        files: (user.files ?? []).map((f) => f.name),
        highlights: user.captures.filter((c) => c.context.kind === 'text').length,
        pictures: user.captures.filter((c) => c.context.kind === 'image').length,
        hidden: (user.hidden ?? 0) + (user.files ?? []).reduce((n, f) => n + (f.hidden ?? 0), 0)
      }),
      resend: { used: answers[0]?.used ?? [], outside }
    }
    const running = (this.queues.get(thread.id) ?? Promise.resolve()).then(() => this.run(thread, again, this.reasoningFor(again)))
    this.queues.set(thread.id, running)
    void running.finally(() => {
      if (this.queues.get(thread.id) === running) this.queues.delete(thread.id)
    })
    return null
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
    const saved = await this.deps.chats().get(id)
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
    const draft = this.drafts.get(thread.id)
    this.emit({
      type: 'load',
      messages: thread.messages,
      focusMessageId,
      ...(draft ? { draft } : {}),
      ...(thread.learn === false ? { learn: false as const } : {}),
      ...(turn ? { streaming: turn.answerId } : {})
    })
    if (turn?.asking) this.emit({ type: 'confirm', id: turn.answerId, ...turn.asking })
  }

  /** What's typed in the box for the chat on show. Every window hears it, so the other one can pick it up. */
  setDraft(text: string, from?: string): void {
    const id = this.thread.id
    if (text.trim()) this.drafts.set(id, text)
    else this.drafts.delete(id)
    this.emit({ type: 'draft', text, ...(from ? { from } : {}) })
  }

  draftOf(id: string): string | undefined {
    return this.drafts.get(id)
  }

  /** The user deleted this chat (or all of them): stop and never save it again. */
  forget(id: string): void {
    this.forgotten.add(id)
    this.tables.delete(id)
    this.drafts.delete(id)
    this.stopChat(id)
    if (this.thread.id === id) this.reset()
  }

  /** Saves a turn's rows, if the user keeps chats. Never throws: a failed save shouldn't break the answer. */
  private persist(thread: Thread, from: WriteFrom): void {
    if (!this.deps.settings().rememberChats || this.forgotten.has(thread.id)) return
    this.deps.chats()
      .write(thread, from)
      .catch((err) => console.error('Could not save chat', err))
  }

  /** Stops the answer on show. */
  stop(): void {
    this.stopChat(this.thread.id)
  }

  stopChat(id: string, why?: string): void {
    const turn = this.live.get(id)
    if (!turn) return
    turn.stopped = !why
    turn.abort.abort()
    for (const resolve of turn.confirms.values()) resolve(false, why)
    turn.confirms.clear()
    turn.asking = undefined
  }

  /** Stops every answer in progress, for the one stop control. */
  stopAll(): void {
    for (const id of [...this.live.keys()]) this.stopChat(id)
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
    rawText: string,
    rawCaptures: Capture[],
    app: AppInfo | null,
    opts: Pick<SendOptions, 'language' | 'action' | 'files'> = {}
  ): Promise<void> {
    const { typed: text, captures, hidden, lines: hiddenAt } = hideKeys(rawText, rawCaptures)
    const thread = this.thread
    // A new question in the same chat replaces its answer: one history can't take two turns at once.
    this.stopChat(thread.id, 'you asked something else')
    this.drafts.delete(thread.id)
    this.makeRoom(thread.id)
    const home = this.deps.settings().homeLanguage
    const prepared = takeFiles(opts.files)
    const language = resolveLanguage({
      typed: opts.action ? '' : text,
      picked: opts.language,
      action: opts.action,
      selection: capturedText(captures) || undefined,
      fileText: captures.length ? undefined : sampleText(prepared.map((p) => p.doc)),
      home
    })
    if (home && language === home && !this.deps.settings().homeUsed) this.hooks.onHomeUsed?.()
    const prompt = opts.action ? actionPrompt(opts.action, language, home) : text
    const budget = fileBudget(this.deps.profile().contextTokens)
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
      ...(files.length ? { files } : {}),
      ...(hidden ? { hidden } : {})
    }
    // On the Mac only, for "Otty hid 1 key": never saved, never sent (D-40).
    this.deps.keepHidden(userMsg.id, hiddenAt)
    if (!thread.messages.length) {
      thread.title = titleFor(text, captures, files[0]?.name)
      const where = captures[0]?.app ?? app
      if (where) thread.app = where.name
    }
    thread.messages.push(userMsg)
    thread.updatedAt = Date.now()
    this.tell(thread, { type: 'user', ...userMsg })

    // Let a stopped turn finish cleaning up its own history before this one adds to it.
    const found = tablesIn([
      ...prepared.flatMap((p) => (p.doc?.kind === 'text' ? [{ text: p.doc.text, source: p.meta.name }] : [])),
      ...captures.flatMap((c) => (c.context.kind === 'text' ? [{ text: c.context.text, source: 'the highlighted table' }] : []))
    ])
    if (found.length) this.tables.set(thread.id, [...found, ...(this.tables.get(thread.id) ?? [])].slice(0, 5))
    const sent = questionWhat({
      files: files.map((f) => f.name),
      highlights: captures.filter((c) => c.context.kind === 'text').length,
      pictures: captures.filter((c) => c.context.kind === 'image').length,
      hidden: hidden + files.reduce((n, f) => n + (f.hidden ?? 0), 0)
    })
    const turn: Turn = { typed: text, prompt, action: opts.action, captures, app, files: fitted, language, home, hidden, sent }
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
    return this.run(thread, turn, this.reasoningFor(turn))
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
    const fresh = safely([], () => observe(this.deps.memory(), { app, language: turn.language, action: turn.action, typed: turn.typed }))
    for (const m of fresh) this.note(thread, answer, { memoryId: m.id, text: m.text, action: 'added' })
  }

  /** "Think deeper" means always think. Otherwise only a real problem is worth the wait. */
  private reasoningFor(turn: Turn): 'normal' | undefined {
    const tier = mathTier(turn.typed, turn.captures.length > 0)
    return (tier === 'problem' || turn.action === 'working') && !this.deps.settings().thinking ? 'normal' : undefined
  }

  private async run(thread: Thread, turn: Turn, reasoning?: 'normal'): Promise<void> {
    const { prompt: text, captures, app, files, language, home, resend } = turn
    count('questions')
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
    const live: LiveTurn = { thread, answerId: id, answer, abort, confirms: new Map() }
    this.live.set(thread.id, live)
    this.hooks.onTurn?.(false)
    let finished = false

    // reasoning_content is only meaningful within the turn that produced it.
    for (const m of history) if (m.role === 'assistant') delete m.reasoning_content
    // A retry's question is already the last message, so the turn starts there.
    const turnStart = resend ? history.length - 1 : history.length
    let used = resend?.used ?? []
    if (!resend) {
      // Saved as sent: nothing already sent may change, or DeepSeek's cache misses from that point on.
      const where = (captures[0]?.app ?? app)?.name ?? null
      const memory = memoryNote(this.deps.settings().learn ? this.deps.memory() : null, [turn.typed, capturedText(captures)].join(' '), where, history)
      used = memory.used
      const stepNotes = this.stepNotes.get(thread.id) ?? []
      this.stepNotes.delete(thread.id)
      const hints = turn.action ? [] : turnHints({ typed: turn.typed, picture: captures.some((c) => c.context.kind === 'image'), app: where, learn: this.learns(thread), table: this.tables.has(thread.id) })
      const note = [turnNote(language, home), memory.note, hiddenNote(turn.hidden), ...hints, ...stepNotes].filter(Boolean).join('\n')
      history.push({ role: 'user', content: withNote(userContent(text, captures, app, files), note) })
    }
    const system = systemPrompt(home, this.deps.profile().web !== 'off', Boolean(this.deps.settings().learn))
    this.tell(thread, { type: 'start', id, language })
    if (used.length) {
      answer.used = used
      this.tell(thread, { type: 'memory-used', id, used })
    }
    // Habits were counted the first time.
    if (!resend) this.noticeHabits(thread, turn, answer)

    // What came in from outside this turn, so that nothing in it can become a memory.
    const outside = resend ? resend.outside : [capturedText(captures), ...files.map((f) => f.text)].join('\n')
    const heard: LearnTurn = {
      typed: turn.typed,
      outside,
      hadOutside: captures.length > 0 || files.length > 0 || Boolean(resend && outside.trim())
    }
    const place = { chatId: thread.id, messageId: id, inferred: 0 }
    const learning = (act: () => ReturnType<typeof remember>) => {
      if (!this.learns(thread)) return { result: 'Not saved: the user turned learning off for this chat. Don’t say it was saved.', status: 'denied' as const }
      const { outcome, note } = safely({ outcome: { result: 'That didn’t work.', status: 'error' as const } }, act)
      if (!note) return outcome
      this.note(thread, answer, note)
      return { ...outcome, undo: { ref: String(note.memoryId), label: UNDO_NOTE[note.action](note.text) } }
    }

    // D-41: the user's own data is in this turn's context: a capture or file in this chat, or a memory that matched.
    const taint: RunTaint = {
      private: used.length > 0 || thread.messages.some((m) => m.role === 'user' && (m.captures.length > 0 || Boolean(m.files?.length))),
      outside: false
    }

    try {
      const sent = { kind: 'question' as const, chatId: thread.id, group: id, what: turn.sent }
      await runLoop({
        provider: () => this.deps.provider(sent),
        system,
        history,
        tools: () => toolDefs(CHAT_TOOLS),
        context: {
          allowed: CHAT_TOOLS,
          taint,
          cause: { chatId: thread.id, answerId: id },
          sent: { chatId: thread.id, group: id },
          confirm: (card) => this.askConfirm(live, card),
          knownUrl: (url) => isKnownUrl(url, history),
          mac: this.deps.mac,
          showSteps: (args) => this.showSteps(thread, answer, args, captures[0]?.app ?? app),
          makeChart: (args) => this.makeChart(thread, answer, args),
          startJob: (args) => this.offerJob(live, answer, args, language),
          scheduleJob: (args) => this.offerJob(live, answer, args, language, true),
          learn: {
            remember: (args) => learning(() => remember(this.deps.memory(), args, heard, place)),
            forget: (args) => learning(() => forgetMemory(this.deps.memory(), args, heard))
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
          if (e.type === 'tool-result' && LASTING_TOOLS.has(e.name) && e.outcome.status === 'done') answer.lasting = [...(answer.lasting ?? []), e.outcome.result.slice(0, 160)]
          if (e.type === 'tool-result' && live.undoable) this.receiptUndo(live, e.outcome)
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
        if (live.stopped) answer.stopped = true
        this.tell(thread, { type: 'done', id, ...(live.stopped ? { stopped: true as const } : {}) })
      } else {
        const message = err instanceof FriendlyError ? err.message : 'Oops — something unexpected happened. Please try again.'
        const kind = err instanceof FriendlyError ? err.kind : 'other'
        if (!(err instanceof FriendlyError)) console.error(err)
        answer.error = message
        if (kind !== 'other') answer.errorKind = kind
        this.tell(thread, { type: 'error', id, message, kind })
      }
    } finally {
      if (this.live.get(thread.id) === live) this.live.delete(thread.id)
      this.hooks.onTurn?.(finished && thread.id !== this.thread.id)
      thread.updatedAt = Date.now()
      // Only this turn's rows: the cost doesn't grow with the length of the chat.
      this.persist(thread, { messages: answerAt, history: turnStart })
      void this.deps.pruneChats().catch((err) => console.error('Could not forget old chats', err))
      if (finished) this.afterAnswer(thread, answer, answerAt === 1)
    }
  }

  /** Background work once an answer is complete. None of it touches the chat's history. */
  private afterAnswer(thread: Thread, answer: Answer, first: boolean): void {
    // Past the month's limit, explanations are fetched when tapped, not ahead of time.
    if (!this.hooks.overCap?.()) for (const term of termsToWarm(answer.text)) void explainTerm(term, answer.text, answer.language ?? 'en')
    if (first) void this.writeTitle(thread, answer.text)
  }

  /** The instant title stays if this fails. `thread` is the chat the turn ran on, which may not be the current one. */
  private async writeTitle(thread: Thread, answer: string): Promise<void> {
    if (!this.deps.settings().rememberChats) return
    const asked = thread.messages[0]
    if (asked?.role !== 'user') return
    try {
      const question = [asked.text, capturedText(asked.captures)].filter(Boolean).join('\n')
      const { text } = await this.deps.provider({ kind: 'title', chatId: thread.id }).complete({ messages: [{ role: 'user', content: titlePrompt(question, answer) }], maxTokens: 24, reasoning: 'least' })
      const title = cleanTitle(text)
      if (!title) return
      thread.title = title
      this.persist(thread, { messages: thread.messages.length, history: thread.history.length })
    } catch {
      /* the instant title is fine */
    }
  }

  /** Shows a card and waits. However it ends, it leaves a receipt in the answer, saved with the turn (D-60). */
  private askConfirm(turn: LiveTurn, card: ConfirmCard): Promise<boolean> {
    const confirmId = randomUUID()
    return new Promise((resolve) => {
      turn.confirms.set(confirmId, (allowed, why) => {
        const receipt = receiptFor(card, allowed, why)
        const at = (turn.answer.receipts = [...(turn.answer.receipts ?? []), receipt]).length - 1
        turn.undoable = allowed && (card.kind === 'reminder' || card.kind === 'job') ? { at, kind: card.kind } : undefined
        this.tell(turn.thread, { type: 'receipt', id: turn.answerId, at, receipt })
        resolve(allowed)
      })
      turn.asking = { confirmId, card }
      this.tell(turn.thread, { type: 'confirm', id: turn.answerId, confirmId, card })
    })
  }

  /** The tool a card allowed has run: its Undo, if it has one, goes on the receipt. */
  private receiptUndo(turn: LiveTurn, outcome: ToolOutcome): void {
    const { at, kind } = turn.undoable!
    turn.undoable = undefined
    const receipt = turn.answer.receipts?.[at]
    if (!receipt || !outcome.undo || outcome.status !== 'done') return
    receipt.undo = { kind, ...outcome.undo }
    this.tell(turn.thread, { type: 'receipt', id: turn.answerId, at, receipt })
  }

  /** Undo on a receipt in the chat on show: removes the reminder, or stops the look. */
  async undoReceipt(answerId: string, at: number): Promise<boolean> {
    const thread = this.thread
    const index = thread.messages.findIndex((m) => m.id === answerId)
    const answer = thread.messages[index]
    const receipt = answer?.role === 'assistant' ? answer.receipts?.[at] : undefined
    if (!receipt?.undo || receipt.undone) return false
    const { kind, ref } = receipt.undo
    try {
      if (kind === 'job') await this.hooks.withdrawJob?.(ref)
      else await this.deps.mac.unremind(ref)
    } catch (err) {
      console.error('Could not undo from a receipt', err)
      return false
    }
    this.deps.ledger()?.markUndone(thread.id, kind, ref)
    receipt.undone = true
    this.persist(thread, { messages: index, history: thread.history.length })
    this.emit({ type: 'receipt', id: answerId, at, receipt })
    return true
  }

  /**
   * Undo from the Logbook (D-63): the change a ledger row names, taken back the same way its receipt or Noted line
   * would, and that line marked too, so the chat and the Logbook agree. False when it can't be undone.
   */
  async undoChange(rowId: number): Promise<boolean> {
    const ledger = this.deps.ledger()
    const row = ledger?.get(rowId)
    if (!row || !canUndo(row) || !row.chatId || !row.ref) return false
    const { chatId, ref } = row
    const thread = this.live.get(chatId)?.thread ?? (this.thread.id === chatId ? this.thread : await this.deps.chats().get(chatId))
    const index = thread?.messages.findIndex((m) => m.id === row.answerId) ?? -1
    const answer = thread?.messages[index]
    if (row.undo === 'memory') {
      const note = answer?.role === 'assistant' ? answer.memories?.find((n) => String(n.memoryId) === ref && !n.undone) : undefined
      if (!thread || !note || answer?.role !== 'assistant') return false
      const undone = safely(note, () => undo(this.deps.memory(), note))
      if (!undone.undone) return false
      answer.memories = answer.memories!.map((n) => (n === note ? undone : n))
      ledger!.markUndone(chatId, 'memory', ref)
      this.persist(thread, { messages: index, history: thread.history.length })
      this.tell(thread, { type: 'memory', id: answer.id, note: undone })
      return true
    }
    try {
      if (row.undo === 'job') await this.hooks.withdrawJob?.(ref)
      else await this.deps.mac.unremind(ref)
    } catch (err) {
      console.error('Could not undo from the Logbook', err)
      return false
    }
    ledger!.markUndone(chatId, row.undo, ref)
    const at = answer?.role === 'assistant' ? (answer.receipts?.findIndex((r) => r.undo?.ref === ref && !r.undone) ?? -1) : -1
    if (thread && answer?.role === 'assistant' && at >= 0) {
      const receipt = { ...answer.receipts![at], undone: true }
      answer.receipts![at] = receipt
      this.persist(thread, { messages: index, history: thread.history.length })
      this.tell(thread, { type: 'receipt', id: answer.id, at, receipt })
    }
    return true
  }

  /** The model only asks. The card is what starts a job, so a hostile page can't. */
  private async offerJob(turn: LiveTurn, answer: Answer, args: Record<string, unknown>, language: AnswerLanguage, later = false): Promise<ToolOutcome> {
    const title = String(args.title ?? '').trim().slice(0, 80)
    const brief = String(args.brief ?? '').trim().slice(0, 2_000)
    if (!title || !brief || !this.hooks.startJob) return { result: 'That needs a title and a brief.', status: 'error' }
    const asked = later ? parseDue(args.at) : null
    if (later && !asked) return { result: 'That time isn’t usable: it has passed, is under a minute away, is more than a month off, or isn’t a time. Ask the user when they mean.', status: 'error' }
    const repeat = asked && args.repeat !== undefined && args.repeat !== 'once' ? parseRepeat(args.repeat, asked) : null
    if (asked && args.repeat !== undefined && args.repeat !== 'once' && !repeat) return { result: 'Repeats can be daily, weekdays or weekly. Ask the user which they mean.', status: 'error' }
    const dueAt = asked && repeat ? firstRun(repeat, asked) : asked
    const cost = (await this.hooks.jobCost?.().catch(() => '')) ?? ''
    const costLine = cost ? `\n\n${cost}` : ''
    const when = repeat && dueAt ? `${capitalised(repeatWords(repeat, dueAt))}, starting ${describeWhen(dueAt)}` : dueAt ? capitalised(describeWhen(dueAt)) : ''
    const often = repeat ? ` That’s about ${runsPerMonth(repeat)} looks a month, each with its own note, until you cancel it in the Logbook.` : ''
    const detail = dueAt
      ? `${when}, Otty will look this up on public web pages, using your AI key, and leave a note in the Logbook. It won’t send or change anything.${often} Otty has to be running then; if your Mac is asleep, it looks when it wakes.\n\n${brief}\n\nOnly this text goes with it.${costLine}`
      : `${brief}\n\nOtty will look this up on public web pages using your AI key, and only this text goes with it.${costLine}`
    const heading = repeat ? 'Check this regularly?' : dueAt ? 'Look into this later?' : 'Look into this in the background?'
    if (!(await this.askConfirm(turn, jobCard(heading, title, detail, Boolean(dueAt), Boolean(this.hooks.overCap?.()))))) return { result: 'The user declined.', status: 'denied' }
    const thread = turn.thread
    const seedUrls = urlsIn(brief).filter((url) => isKnownUrl(url, thread.history))
    const jobId = randomUUID()
    const problem = await this.hooks.startJob({ id: jobId, title, brief, sourceThread: thread.id, seedUrls, language, ...(dueAt ? { dueAt } : {}), ...(repeat ? { repeat } : {}) })
    if (problem) return { result: problem, status: 'error' }
    answer.jobs = [...(answer.jobs ?? []), { id: jobId, title }]
    const undo = { ref: jobId, label: `Stop looking into “${title}”` }
    if (repeat && dueAt) return { result: `Scheduled ${repeatWords(repeat, dueAt)}, starting ${describeWhen(dueAt)}. Each look leaves its own note in the Logbook.`, status: 'done', undo }
    return { result: dueAt ? `Scheduled for ${describeWhen(dueAt)}. The user will find the note in the Logbook.` : 'Started. The user will find the report in the Logbook.', status: 'done', undo }
  }

  /** A chart of the user's own table. Code adds it up; the model only said what to chart (D-35). */
  private makeChart(thread: Thread, answer: Answer, args: Record<string, unknown>): ToolOutcome {
    const tables = this.tables.get(thread.id) ?? []
    if (!tables.length) return { result: 'There’s no table in this chat that Otty can read. Ask the user to attach the CSV or highlight the table again.', status: 'error' }
    const named = typeof args.source === 'string' ? tables.find((t) => t.source.toLowerCase() === String(args.source).trim().toLowerCase()) : undefined
    const built = buildChart(named ?? tables[0], args)
    if (typeof built === 'string') return { result: built, status: 'error' }
    answer.charts = [...(answer.charts ?? []), built.card].slice(-3)
    this.tell(thread, { type: 'chart', id: answer.id, chart: built.card })
    return { result: built.result, status: 'done' }
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
    // A step's button changes something in another app, so it's written down first (D-46). It can't be undone.
    const done = begin({ tool: `step:${step.action.kind}`, chatId: thread.id, answerId, summary: `Step: ${step.text}`, undo: 'none' }, this.deps.ledger())
    const result = await act(step.action, found.card.app ?? null)
    done({ status: result.ok ? 'done' : 'failed' })
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

  /** "I did it, check?": the user finished a step and wants Otty to look and say what's next. */
  checkQuestion(answerId: string, index: number): string | null {
    const found = this.card(answerId, index)
    const next = found?.card.steps[index + 1]
    return (
      found &&
      `I’ve done step ${index + 1} (“${found.card.steps[index].text}”). Can you check it worked${next ? ` and tell me if I’m ready for step ${index + 2}` : ' and tell me if I’m all done'}?`
    )
  }
}

/** An explanation, or a failure with friendly words. Only real explanations are kept. */
async function fetchExplanation(term: string, around: string, language: AnswerLanguage): Promise<string> {
  const { text } = await activeProvider({ kind: 'explain', what: term }).complete({
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
    await activeProvider({ kind: 'check', what: 'a small grey square, to see if the model can see pictures' }).complete({
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
    const reply = await activeProvider({ kind: 'check', what: 'a test message' }).complete({ messages: [{ role: 'user', content: 'Say hi in 3 words.' }], maxTokens: 20 })
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

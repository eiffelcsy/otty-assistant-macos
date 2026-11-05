import { randomUUID } from 'crypto'
import { nativeImage } from 'electron'
import type { AnswerLanguage, AppInfo, Capture, ChatEvent, ChatMessage, HomeLanguage, SendOptions } from '../shared/types'
import { capturedText } from '../shared/captures'
import { chatStore, pruneOldChats, type Thread, type WriteFrom } from './store'
import { fileBudget, fitFiles, type FileOutput } from './files/budget'
import { takeFiles } from './files'
import { getStored } from './settings'
import { resolveLanguage, turnNote, withNote } from './language'
import { actionPrompt, explainPrompt, systemPrompt } from './prompts'
import { runTool, toolDefs, toolLabel } from './tools'
import { isKnownUrl } from './knownUrls'
import { activeProfile, activeProvider, FriendlyError, NoVisionError, type ContentPart, type ToolCall } from './providers'

// The conversation: what's sent, what comes back and what's saved. Talking to the model service is `providers/`.

const MAX_TOOL_ROUNDS = 6

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
      body = `${prefix}${which} is a snip of part of my screen.\n\n${text}`
    }
  } else {
    let picture = 0
    const blocks = captures.map((c, i) => {
      const label = `[Capture ${i + 1}${fromApp(c.app)}]`
      if (c.context.kind === 'text') return `${label} Text I highlighted:\n"""\n${c.context.text}\n"""`
      picture++
      return `${label} A snip of part of my screen: picture ${picture}.`
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
  private thread = newThread()
  private abort: AbortController | null = null
  private running: Promise<void> = Promise.resolve()
  private confirms = new Map<string, (ok: boolean) => void>()
  /** Chats the user deleted while a turn was still running: that turn must not write them back. */
  private forgotten = new Set<string>()

  constructor(private emit: (e: ChatEvent) => void) {}

  get threadId(): string {
    return this.thread.id
  }

  /** Starts a new conversation. The old one stays in Recent chats. */
  reset(): void {
    this.stop()
    this.thread = newThread()
  }

  /** Reopens a saved chat and shows it. Returns false if it no longer exists. */
  async open(id: string, focusMessageId?: string): Promise<boolean> {
    const saved = await chatStore().get(id)
    if (!saved) return false
    this.stop()
    this.thread = structuredClone(saved)
    this.emit({ type: 'load', messages: this.thread.messages, focusMessageId })
    return true
  }

  /** The user deleted this chat (or all of them): stop and never save it again. */
  forget(id: string): void {
    this.forgotten.add(id)
    if (this.thread.id === id) this.reset()
  }

  /** Saves a turn's rows, if the user keeps chats. Never throws: a failed save shouldn't break the answer. */
  private persist(thread: Thread, from: WriteFrom): void {
    if (!getStored().rememberChats || this.forgotten.has(thread.id)) return
    chatStore()
      .write(thread, from)
      .catch((err) => console.error('Could not save chat', err))
  }

  stop(): void {
    this.abort?.abort()
    this.abort = null
    for (const resolve of this.confirms.values()) resolve(false)
    this.confirms.clear()
  }

  respondConfirm(id: string, allow: boolean): void {
    this.confirms.get(id)?.(allow)
    this.confirms.delete(id)
  }

  /** `text` is what the user sees; a quick action swaps in its own prompt for the model. */
  send(
    text: string,
    captures: Capture[],
    app: AppInfo | null,
    opts: Pick<SendOptions, 'language' | 'action' | 'files'> = {}
  ): Promise<void> {
    this.stop()
    const thread = this.thread
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
    this.emit({ type: 'user', ...userMsg })

    // Let a stopped turn finish cleaning up its own history before this one adds to it.
    const prev = this.running
    this.running = prev.then(() => this.run(thread, prompt, captures, app, fitted, language, home))
    // Save the question now, so a crash mid-answer keeps it. setImmediate runs after the request has been sent,
    // so the write is never on the way to the first token.
    const at = thread.messages.length - 1
    setImmediate(() => this.persist(thread, { messages: at, history: thread.history.length }))
    return this.running
  }

  private async run(
    thread: Thread,
    text: string,
    captures: Capture[],
    app: AppInfo | null,
    files: FileOutput[],
    language: AnswerLanguage,
    home: HomeLanguage | null
  ): Promise<void> {
    const id = randomUUID()
    const abort = new AbortController()
    this.abort = abort
    const history = thread.history
    const answer: Extract<ChatMessage, { role: 'assistant' }> = {
      id,
      role: 'assistant',
      text: '',
      tools: [],
      language,
      at: Date.now()
    }
    const answerAt = thread.messages.push(answer) - 1

    // reasoning_content is only meaningful within the turn that produced it.
    for (const m of history) if (m.role === 'assistant') delete m.reasoning_content
    const turnStart = history.length
    // Saved as sent: nothing already sent may change, or DeepSeek's cache misses from that point on.
    history.push({ role: 'user', content: withNote(userContent(text, captures, app, files), turnNote(language, home)) })
    const system = systemPrompt(home, activeProfile().web !== 'off')
    this.emit({ type: 'start', id, language })

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const allowTools = round < MAX_TOOL_ROUNDS
        const replies = activeProvider().stream({ system, messages: history, tools: allowTools ? toolDefs() : undefined }, abort.signal)

        let content = ''
        let reasoning = ''
        const toolCalls: ToolCall[] = []

        for await (const event of replies) {
          if (event.type === 'reasoning') reasoning += event.text
          if (event.type === 'tool') toolCalls.push(event.call)
          if (event.type === 'text') {
            content += event.text
            answer.text += event.text
            this.emit({ type: 'delta', id, text: event.text })
          }
        }

        history.push({
          role: 'assistant',
          content: content || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
          ...(reasoning ? { reasoning_content: reasoning } : {})
        })
        if (!toolCalls.length) break

        for (const call of toolCalls) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(call.function.arguments || '{}')
          } catch {
            /* model sent bad JSON; tool will see empty args */
          }
          const { label, icon } = toolLabel(call.function.name, args)
          this.emit({ type: 'tool', id, callId: call.id, label, icon, status: 'running' })
          const out = await runTool(call.function.name, args, {
            confirm: (title, detail) => this.askConfirm(id, title, detail),
            knownUrl: (url) => isKnownUrl(url, history)
          })
          if (abort.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
          answer.tools = [...answer.tools.filter((t) => t.callId !== call.id), { callId: call.id, label, icon, status: out.status }]
          this.emit({ type: 'tool', id, callId: call.id, label, icon, status: out.status })
          history.push({ role: 'tool', tool_call_id: call.id, content: out.result })
        }
      }
      this.emit({ type: 'done', id })
    } catch (err) {
      // Drop the unfinished turn so a dangling tool call can't break the next request.
      history.length = turnStart
      if ((err as Error).name === 'AbortError') {
        this.emit({ type: 'done', id })
      } else {
        const message = err instanceof FriendlyError ? err.message : 'Oops — something unexpected happened. Please try again.'
        if (!(err instanceof FriendlyError)) console.error(err)
        answer.error = message
        this.emit({ type: 'error', id, message })
      }
    } finally {
      if (this.abort === abort) this.abort = null
      thread.updatedAt = Date.now()
      // Only this turn's rows: the cost doesn't grow with the length of the chat.
      this.persist(thread, { messages: answerAt, history: turnStart })
      void pruneOldChats().catch((err) => console.error('Could not forget old chats', err))
    }
  }

  private askConfirm(id: string, title: string, detail: string): Promise<boolean> {
    const confirmId = randomUUID()
    return new Promise((resolve) => {
      this.confirms.set(confirmId, resolve)
      this.emit({ type: 'confirm', id, confirmId, title, detail })
    })
  }
}

export async function explainTerm(term: string, around: string, language: AnswerLanguage = 'en'): Promise<string> {
  try {
    const { text } = await activeProvider().complete({
      messages: [{ role: 'user', content: explainPrompt(term, around, language, getStored().homeLanguage) }],
      maxTokens: 300
    })
    return text || 'Hmm, Otty couldn’t think of a simple explanation. Try asking in the chat!'
  } catch (err) {
    return err instanceof FriendlyError ? err.message : 'Otty couldn’t fetch that explanation right now.'
  }
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

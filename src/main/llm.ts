import { randomUUID } from 'crypto'
import { nativeImage } from 'electron'
import type { AnswerLanguage, AppInfo, Capture, ChatEvent, ChatMessage, SendOptions } from '../shared/types'
import { capturedText } from '../shared/captures'
import { chatStore, type Thread } from './store'
import { fitFiles, type FileOutput } from './files/budget'
import { takeFiles } from './files'
import { getApiKey, getStored } from './settings'
import { languageBlock, languageReminder, resolveLanguage, withReminder } from './language'
import { actionPrompt, explainPrompt, systemPrompt } from './prompts'
import { runTool, toolDefs, toolLabel } from './tools'

// Minimal OpenAI-compatible chat client (works with DeepSeek and any /chat/completions provider).

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[]; reasoning_content?: string }
  | { role: 'tool'; tool_call_id: string; content: string }

const MAX_TOOL_ROUNDS = 6

export class FriendlyError extends Error {}
/** The model rejected an image, i.e. it has no vision. */
class NoVisionError extends FriendlyError {}

function config() {
  const s = getStored()
  const key = getApiKey()
  if (!key) throw new FriendlyError('Otty needs a DeepSeek key first — open Settings (the gear button) to add one.')
  return { baseUrl: s.baseUrl.replace(/\/+$/, ''), model: s.model, thinking: s.thinking, key }
}

function friendlyHttp(status: number, body: string): FriendlyError {
  if (status === 401) return new FriendlyError('Otty’s key doesn’t look right. Please check it in Settings.')
  if (status === 402) return new FriendlyError('Your DeepSeek balance is empty. Top up at platform.deepseek.com, then try again.')
  if (status === 429) return new FriendlyError('Otty is getting lots of questions right now. Give it a few seconds and try again.')
  if (status >= 500) return new FriendlyError('The AI service is having a moment. Please try again shortly.')
  if (status === 400 && /image|vision|multimodal/i.test(body)) {
    return new NoVisionError('This model can’t look at pictures. Try a vision-capable model in Settings.')
  }
  console.error('LLM error', status, body)
  return new FriendlyError(`Something went wrong (error ${status}). Please try again.`)
}

function networkError(err: unknown): Error {
  if (err instanceof FriendlyError || (err as Error).name === 'AbortError') return err as Error
  return new FriendlyError('Otty can’t reach the internet. Check your connection and try again.')
}

async function post(body: object, signal?: AbortSignal): Promise<Response> {
  const c = config()
  let res: Response
  try {
    res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify({
        model: c.model,
        thinking: { type: c.thinking ? 'enabled' : 'disabled' },
        ...body
      }),
      signal
    })
  } catch (err) {
    throw networkError(err)
  }
  if (!res.ok) throw friendlyHttp(res.status, await res.text().catch(() => ''))
  return res
}

async function* sse(res: Response): AsyncGenerator<any> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      try {
        yield JSON.parse(data)
      } catch {
        /* keep-alive or partial noise */
      }
    }
  }
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
    const note = languageBlock(language, home)
    const reminder = languageReminder(language, home)
    const prepared = takeFiles(opts.files)
    const fitted = fitFiles(prepared.map((p) => ({ name: p.meta.name, doc: p.doc, image: p.image?.dataUrl })))
    const files = prepared.map((p, i) => ({ ...p.meta, note: fitted[i].note }))
    const userMsg: Extract<ChatMessage, { role: 'user' }> = {
      id: randomUUID(),
      role: 'user',
      text,
      captures,
      app: captures.length ? null : app,
      language,
      ...(files.length ? { files } : {})
    }
    if (!thread.messages.length) {
      thread.title = titleFor(text, captures, files[0]?.name)
      const where = captures[0]?.app ?? app
      if (where) thread.app = where.name
    }
    thread.messages.push(userMsg)
    this.emit({ type: 'user', ...userMsg })

    // Let a stopped turn finish cleaning up its own history before this one adds to it.
    const prev = this.running
    this.running = prev.then(() => this.run(thread, prompt, captures, app, fitted, language, note, reminder))
    return this.running
  }

  private async run(
    thread: Thread,
    text: string,
    captures: Capture[],
    app: AppInfo | null,
    files: FileOutput[],
    language: AnswerLanguage,
    note: string,
    reminder: string
  ): Promise<void> {
    const id = randomUUID()
    const abort = new AbortController()
    this.abort = abort
    const history = thread.history
    const answer: Extract<ChatMessage, { role: 'assistant' }> = { id, role: 'assistant', text: '', tools: [], language }
    thread.messages.push(answer)

    // reasoning_content is only meaningful within the turn that produced it.
    for (const m of history) if (m.role === 'assistant') delete m.reasoning_content
    const turnStart = history.length
    history.push({ role: 'user', content: userContent(text, captures, app, files) })
    this.emit({ type: 'start', id, language })

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const allowTools = round < MAX_TOOL_ROUNDS
        const res = await post(
          {
            messages: [{ role: 'system', content: systemPrompt(note) }, ...remindTurn(history, turnStart, reminder)],
            stream: true,
            ...(allowTools ? { tools: toolDefs() } : {})
          },
          abort.signal
        )

        let content = ''
        let reasoning = ''
        const calls: ToolCall[] = []

        for await (const chunk of sse(res)) {
          const delta = chunk.choices?.[0]?.delta
          if (!delta) continue
          if (delta.reasoning_content) reasoning += delta.reasoning_content
          if (delta.content) {
            content += delta.content
            answer.text += delta.content
            this.emit({ type: 'delta', id, text: delta.content })
          }
          for (const tc of delta.tool_calls ?? []) {
            const slot = (calls[tc.index ?? 0] ??= { id: '', type: 'function', function: { name: '', arguments: '' } })
            if (tc.id) slot.id = tc.id
            if (tc.function?.name) slot.function.name += tc.function.name
            if (tc.function?.arguments) slot.function.arguments += tc.function.arguments
          }
        }

        const toolCalls = calls.filter(Boolean)
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
            confirm: (title, detail) => this.askConfirm(id, title, detail)
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
      if (getStored().rememberChats) chatStore().save(thread).catch((err) => console.error('Could not save chat', err))
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

/** History with this turn's user message carrying the language reminder. A copy: the reminder is never saved. */
function remindTurn(history: Message[], index: number, reminder: string): Message[] {
  const m = history[index]
  if (!reminder || m?.role !== 'user') return history
  return history.map((h, i) => (i === index ? { ...m, content: withReminder(m.content, reminder) } : h))
}

export async function explainTerm(term: string, around: string, language: AnswerLanguage = 'en'): Promise<string> {
  try {
    const res = await post({
      messages: [{ role: 'user', content: explainPrompt(term, around, language, getStored().homeLanguage) }],
      stream: false,
      max_tokens: 300
    })
    const json: any = await res.json()
    return json.choices?.[0]?.message?.content?.trim() || 'Hmm, Otty couldn’t think of a simple explanation. Try asking in the chat!'
  } catch (err) {
    return err instanceof FriendlyError ? err.message : 'Otty couldn’t fetch that explanation right now.'
  }
}

/** Sends a small grey square. True = the model can see, false = it can't, null = couldn't tell. */
async function canSeeImages(): Promise<boolean | null> {
  const png = nativeImage.createFromBitmap(Buffer.alloc(32 * 32 * 4, 200), { width: 32, height: 32 }).toPNG()
  try {
    const res = await post({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
            { type: 'text', text: 'What colour is this? One word.' }
          ]
        }
      ],
      stream: false,
      max_tokens: 10
    })
    await res.json()
    return true
  } catch (err) {
    return err instanceof NoVisionError ? false : null
  }
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await post({ messages: [{ role: 'user', content: 'Say hi in 3 words.' }], stream: false, max_tokens: 20 })
    const json: any = await res.json()
    const model = String(json.model || getStored().model)
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

import { randomUUID } from 'crypto'
import type { ChatEvent, ScreenContext } from '../shared/types'
import { getApiKey, getStored } from './settings'
import { explainPrompt, systemPrompt } from './prompts'
import { runTool, toolDefs, toolLabel } from './tools'

// Minimal OpenAI-compatible chat client (works with DeepSeek and any /chat/completions provider).

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[]; reasoning_content?: string }
  | { role: 'tool'; tool_call_id: string; content: string }

const MAX_TOOL_ROUNDS = 6

export class FriendlyError extends Error {}

function config() {
  const s = getStored()
  const key = getApiKey()
  if (!key) throw new FriendlyError('Otty needs a DeepSeek key first — open Settings (⚙️) to add one.')
  return { baseUrl: s.baseUrl.replace(/\/+$/, ''), model: s.model, thinking: s.thinking, key }
}

function friendlyHttp(status: number, body: string): FriendlyError {
  if (status === 401) return new FriendlyError('Otty’s key doesn’t look right. Please check it in Settings.')
  if (status === 402) return new FriendlyError('Your DeepSeek balance is empty. Top up at platform.deepseek.com, then try again.')
  if (status === 429) return new FriendlyError('Otty is getting lots of questions right now. Give it a few seconds and try again.')
  if (status >= 500) return new FriendlyError('The AI service is having a moment. Please try again shortly.')
  if (status === 400 && /image/i.test(body)) return new FriendlyError('This model can’t look at pictures. Try a vision-capable model in Settings.')
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

function userContent(text: string, ctx: ScreenContext | null): string | ContentPart[] {
  if (!ctx) return text
  if (ctx.kind === 'text') {
    return `Here is the text I highlighted on my screen:\n"""\n${ctx.text}\n"""\n\n${text}`
  }
  return [
    { type: 'image_url', image_url: { url: ctx.dataUrl } },
    { type: 'text', text: `This is a snip of part of my screen.\n\n${text}` }
  ]
}

export class ChatSession {
  private history: Message[] = []
  private abort: AbortController | null = null
  private confirms = new Map<string, (ok: boolean) => void>()

  constructor(private emit: (e: ChatEvent) => void) {}

  reset(): void {
    this.stop()
    this.history = []
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

  async send(text: string, ctx: ScreenContext | null): Promise<void> {
    this.stop()
    const id = randomUUID()
    const abort = new AbortController()
    this.abort = abort

    // reasoning_content is only meaningful within the turn that produced it.
    for (const m of this.history) if (m.role === 'assistant') delete m.reasoning_content
    const turnStart = this.history.length
    this.history.push({ role: 'user', content: userContent(text, ctx) })
    this.emit({ type: 'start', id })

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const allowTools = round < MAX_TOOL_ROUNDS
        const res = await post(
          {
            messages: [{ role: 'system', content: systemPrompt() }, ...this.history],
            stream: true,
            ...(allowTools ? { tools: toolDefs } : {})
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
        this.history.push({
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
          const label = toolLabel(call.function.name, args)
          this.emit({ type: 'tool', id, callId: call.id, label, status: 'running' })
          const out = await runTool(call.function.name, args, {
            confirm: (title, detail) => this.askConfirm(id, title, detail)
          })
          if (abort.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
          this.emit({ type: 'tool', id, callId: call.id, label, status: out.status })
          this.history.push({ role: 'tool', tool_call_id: call.id, content: out.result })
        }
      }
      this.emit({ type: 'done', id })
    } catch (err) {
      // Drop the unfinished turn so a dangling tool call can't break the next request.
      this.history.length = turnStart
      if ((err as Error).name === 'AbortError') {
        this.emit({ type: 'done', id })
      } else {
        const message = err instanceof FriendlyError ? err.message : 'Oops — something unexpected happened. Please try again.'
        if (!(err instanceof FriendlyError)) console.error(err)
        this.emit({ type: 'error', id, message })
      }
    } finally {
      if (this.abort === abort) this.abort = null
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

export async function explainTerm(term: string, around: string): Promise<string> {
  try {
    const res = await post({
      messages: [{ role: 'user', content: explainPrompt(term, around) }],
      stream: false,
      max_tokens: 300
    })
    const json: any = await res.json()
    return json.choices?.[0]?.message?.content?.trim() || 'Hmm, Otty couldn’t think of a simple explanation. Try asking in the chat!'
  } catch (err) {
    return err instanceof FriendlyError ? err.message : 'Otty couldn’t fetch that explanation right now.'
  }
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await post({ messages: [{ role: 'user', content: 'Say hi in 3 words.' }], stream: false, max_tokens: 20 })
    await res.json()
    return { ok: true, message: 'Connected! Otty is ready to help. 🦦' }
  } catch (err) {
    return { ok: false, message: err instanceof FriendlyError ? err.message : 'Could not connect.' }
  }
}

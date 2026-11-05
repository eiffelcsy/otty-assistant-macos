import { app } from 'electron'
import { FriendlyError, NoVisionError } from './errors'
import type { ChatRequest, Provider, ProviderEvent, StopReason, ToolCall } from './types'

// Any service with an OpenAI-style /chat/completions, including DeepSeek.

export interface OpenAiConfig {
  baseUrl: string
  model: string
  thinking: boolean
  key: string
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

function requestBody(config: OpenAiConfig, req: ChatRequest): object {
  const thinks = req.reasoning ? req.reasoning !== 'least' : config.thinking
  return {
    model: config.model,
    thinking: { type: thinks ? 'enabled' : 'disabled' },
    messages: req.system === undefined ? req.messages : [{ role: 'system', content: req.system }, ...req.messages]
  }
}

async function post(config: OpenAiConfig, body: object, signal?: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: JSON.stringify(body),
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

const STOPS: Record<string, StopReason> = { stop: 'end', tool_calls: 'tools', length: 'length', content_filter: 'refusal' }

/** Dev builds only: shows whether DeepSeek's cache is working. Counts only, never content. */
function logCache(usage: { prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number }, firstTokenMs: number): void {
  console.log(`[cache] hit ${usage.prompt_cache_hit_tokens ?? '?'} · miss ${usage.prompt_cache_miss_tokens ?? '?'} · first token ${firstTokenMs} ms`)
}

/** `config` is read for each request, so a settings change applies straight away. It throws if Otty can't call yet. */
export function openAiProvider(config: () => OpenAiConfig): Provider {
  return {
    async *stream(req, signal): AsyncGenerator<ProviderEvent> {
      const c = config()
      const measure = !app.isPackaged
      const sentAt = Date.now()
      const res = await post(
        c,
        {
          ...requestBody(c, req),
          stream: true,
          ...(measure ? { stream_options: { include_usage: true } } : {}),
          ...(req.tools ? { tools: req.tools } : {})
        },
        signal
      )

      let firstToken = 0
      let stop: StopReason = 'end'
      const calls: ToolCall[] = []

      for await (const chunk of sse(res)) {
        if (chunk.usage && measure) logCache(chunk.usage, firstToken - sentAt)
        const choice = chunk.choices?.[0]
        if (choice?.finish_reason) stop = STOPS[choice.finish_reason] ?? 'end'
        const delta = choice?.delta
        if (!delta) continue
        firstToken ||= Date.now()
        if (delta.reasoning_content) yield { type: 'reasoning', text: delta.reasoning_content }
        if (delta.content) yield { type: 'text', text: delta.content }
        for (const tc of delta.tool_calls ?? []) {
          const slot = (calls[tc.index ?? 0] ??= { id: '', type: 'function', function: { name: '', arguments: '' } })
          if (tc.id) slot.id = tc.id
          if (tc.function?.name) slot.function.name += tc.function.name
          if (tc.function?.arguments) slot.function.arguments += tc.function.arguments
        }
      }

      for (const call of calls.filter(Boolean)) yield { type: 'tool', call }
      yield { type: 'done', stop }
    },

    async complete(req) {
      const c = config()
      const res = await post(c, { ...requestBody(c, req), stream: false, ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}) })
      const json: any = await res.json()
      return { text: json.choices?.[0]?.message?.content?.trim() ?? '', model: json.model }
    }
  }
}

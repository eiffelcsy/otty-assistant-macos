import { app } from 'electron'
import { FriendlyError, friendlyConnection, friendlyStatus, NoToolsError } from './errors'
import type { Profile } from './profiles'
import type { ChatRequest, Provider, ProviderEvent, StopReason, ToolCall } from './types'

// Any service with an OpenAI-style /chat/completions, including DeepSeek.

export interface OpenAiConfig {
  baseUrl: string
  model: string
  thinking: boolean
  /** Empty when there's none to send. */
  key: string
  profile: Profile
}

function httpError(status: number, body: string, profile: Profile): FriendlyError {
  if (status === 400 && /does not support tools|tools? (is|are) not supported/i.test(body)) return new NoToolsError('This model can’t use tools.')
  return friendlyStatus(status, body, profile)
}

function networkError(err: unknown, profile: Profile): Error {
  if (err instanceof FriendlyError || (err as Error).name === 'AbortError') return err as Error
  return friendlyConnection(profile)
}

function requestBody(config: OpenAiConfig, req: ChatRequest): object {
  const thinks = req.reasoning ? req.reasoning !== 'least' : config.thinking
  // Another service's record of a reply means nothing here, and a strict server would reject it.
  const messages = req.messages.map((m) => {
    if (m.role !== 'assistant') return m
    const { provider: _provider, ...rest } = m
    return rest
  })
  return {
    model: config.model,
    ...(config.profile.reasoning === 'thinking-field' ? { thinking: { type: thinks ? 'enabled' : 'disabled' } } : {}),
    messages: req.system === undefined ? messages : [{ role: 'system', content: req.system }, ...messages]
  }
}

async function post(config: OpenAiConfig, body: object, signal?: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}) },
      body: JSON.stringify(body),
      signal
    })
  } catch (err) {
    throw networkError(err, config.profile)
  }
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), config.profile)
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
      const send = (tools = req.toolsOff ? [] : req.tools) =>
        post(
          c,
          {
            ...requestBody(c, req),
            stream: true,
            ...(measure ? { stream_options: { include_usage: true } } : {}),
            ...(tools?.length ? { tools } : {})
          },
          signal
        )
      const res = await send().catch((err) => {
        if (err instanceof NoToolsError) return send([])
        throw err
      })

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
      const limit = req.maxTokens ? { [c.profile.tokenLimit]: req.maxTokens } : {}
      const res = await post(c, { ...requestBody(c, req), stream: false, ...limit })
      const json: any = await res.json()
      return { text: json.choices?.[0]?.message?.content?.trim() ?? '', model: json.model }
    }
  }
}

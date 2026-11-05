import Anthropic from '@anthropic-ai/sdk'
import { friendlyConnection, friendlyStatus } from './errors'
import { searchesOnServer, type Profile } from './profiles'
import type { ChatRequest, ContentPart, Message, Provider, ProviderEvent, StopReason, ToolCall } from './types'

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
type AnthropicMessage = Anthropic.Beta.Messages.BetaMessageParam
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam

// Any service that speaks Anthropic's Messages format. Claude itself also gets the extras in `claudeExtras`.

export interface AnthropicConfig {
  baseUrl: string
  model: string
  thinking: boolean
  key: string
  profile: Profile
}

/** Room for the reply and, since thinking counts towards the limit, for the thinking too. */
const STREAM_MAX_TOKENS = 64_000
const MIN_COMPLETE_TOKENS = 2_000

const EFFORT = { least: 'low', normal: 'medium', deep: 'high' } as const

/** Lets the API drop thinking it can't use, instead of refusing a chat whose history changed. */
const THINKING_BETA = 'thinking-binding-controls-2026-08-01'
/** On a safety decline, the API answers with another model. Only these models accept it. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const HAS_FALLBACKS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1'])

const STOPS: Record<string, StopReason> = { end_turn: 'end', tool_use: 'tools', max_tokens: 'length', refusal: 'refusal', pause_turn: 'paused' }

/** Each search is billed, so a single answer can only run a few. */
const MAX_SEARCHES = 5

/** Tool ids from another service may hold characters this format rejects. */
const toolId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_')

function imageBlock(url: string): ContentBlock {
  const [, mediaType, data] = url.match(/^data:(image\/[a-z+]+);base64,(.*)$/s) ?? []
  if (!data) return { type: 'text', text: '(A picture that could not be sent.)' }
  return { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/png', data } }
}

const userBlock = (part: ContentPart): ContentBlock => (part.type === 'text' ? { type: 'text', text: part.text } : imageBlock(part.image_url.url))

function toolUse(call: ToolCall): ContentBlock {
  let input: unknown = {}
  try {
    input = JSON.parse(call.function.arguments || '{}')
  } catch {
    /* the model sent bad JSON; the tool saw empty args too */
  }
  return { type: 'tool_use', id: toolId(call.id), name: call.function.name, input }
}

/** A reply from another service, or one saved before Claude was added. */
function assistantBlocks(m: Extract<Message, { role: 'assistant' }>): ContentBlock[] {
  const blocks: ContentBlock[] = [...(m.content ? [{ type: 'text' as const, text: m.content }] : []), ...(m.tool_calls ?? []).map(toolUse)]
  return blocks.length ? blocks : [{ type: 'text', text: '(No reply.)' }]
}

/**
 * Otty's history in this format. A reply from the same server goes back exactly as it came, thinking included.
 * Thinking is signed by the server that wrote it, so a reply from anywhere else is rebuilt from its text and tool calls.
 */
export function toAnthropicMessages(messages: Message[], server: string): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: typeof m.content === 'string' ? m.content : m.content.map(userBlock) })
    } else if (m.role === 'assistant') {
      const saved = m.provider?.id === server ? (m.provider.blocks as ContentBlock[]) : null
      out.push({ role: 'assistant', content: saved ?? assistantBlocks(m) })
    } else if (m.role === 'tool') {
      // All the results of one reply go in a single user message.
      const result: ContentBlock = { type: 'tool_result', tool_use_id: toolId(m.tool_call_id), content: m.content }
      const last = out.at(-1)
      const merge = last?.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')
      if (merge) (last.content as ContentBlock[]).push(result)
      else out.push({ role: 'user', content: [result] })
    }
  }
  return out
}

/** Otty's tool definitions are in OpenAI's shape. */
function toAnthropicTools(tools: readonly object[]): Anthropic.Beta.Messages.BetaTool[] {
  return (tools as { function: { name: string; description?: string; parameters: Anthropic.Beta.Messages.BetaTool.InputSchema } }[]).map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters
  }))
}

/** Identifies who wrote a reply, so it's only replayed to the same server. */
function serverOf(c: AnthropicConfig): string {
  try {
    return new URL(c.baseUrl).host
  } catch {
    return c.baseUrl
  }
}

/** What Anthropic's own API adds to the format. Another server could reject any of it, so it only goes to Claude. */
function claudeExtras(c: AnthropicConfig, req: ChatRequest): Partial<Params> {
  if (c.profile.id !== 'claude') return {}
  const fallbacks = HAS_FALLBACKS.has(c.model)
  const level = req.reasoning ?? (c.thinking ? 'normal' : 'least')
  return {
    betas: [THINKING_BETA, ...(fallbacks ? [FALLBACK_BETA] : [])],
    cache_control: { type: 'ephemeral' },
    // Low effort rather than no thinking: Sonnet 5.5 can't turn it off, and it skips thinking on most simple questions.
    thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
    output_config: { effort: EFFORT[level] },
    ...(fallbacks ? { fallbacks: 'default' as const } : {})
  }
}

function toolParams(c: AnthropicConfig, req: ChatRequest): Partial<Params> {
  const search = searchesOnServer(c.profile, c.model) ? [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: MAX_SEARCHES }] : []
  const tools = [...toAnthropicTools(req.tools ?? []), ...search]
  if (!tools.length) return {}
  return { tools, ...(req.toolsOff ? { tool_choice: { type: 'none' as const } } : {}) }
}

function params(c: AnthropicConfig, req: ChatRequest, maxTokens: number): Params {
  return {
    model: c.model,
    max_tokens: maxTokens,
    messages: toAnthropicMessages(req.messages, serverOf(c)),
    ...(req.system !== undefined ? { system: req.system } : {}),
    // The tools stay listed on a round that can't use them, because changing them counts as editing the chat.
    ...toolParams(c, req),
    ...claudeExtras(c, req)
  }
}

function friendly(err: unknown, profile: Profile): Error {
  if (err instanceof Anthropic.APIUserAbortError) return new DOMException('Stopped', 'AbortError')
  if (err instanceof Anthropic.APIConnectionError) return friendlyConnection(profile)
  if (err instanceof Anthropic.APIError) return friendlyStatus(err.status ?? 0, err.message ?? '', profile)
  return err as Error
}

/**
 * The key is always passed, even when empty, so the SDK can't pick up credentials from elsewhere on the Mac.
 * The SDK sends it as a Bearer token; other servers often expect `x-api-key`, so they get both.
 */
function client(c: AnthropicConfig): Anthropic {
  const headers = c.key && c.profile.id !== 'claude' ? { 'x-api-key': c.key } : undefined
  return new Anthropic({ apiKey: c.key, baseURL: c.baseUrl.replace(/\/(v1\/?)?$/, ''), defaultHeaders: headers })
}

export function anthropicProvider(config: () => AnthropicConfig): Provider {
  return {
    async *stream(req, signal): AsyncGenerator<ProviderEvent> {
      const c = config()
      try {
        const stream = client(c).beta.messages.stream(params(c, req, req.maxTokens ?? STREAM_MAX_TOKENS), { signal })
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield { type: 'text', text: event.delta.text }
          if (event.type === 'content_block_start') {
            const block = event.content_block
            if (block.type === 'server_tool_use' && block.name === 'web_search') yield { type: 'search', status: 'running' }
            if (block.type === 'web_search_tool_result') yield { type: 'search', status: 'done' }
          }
        }
        const message = await stream.finalMessage()
        for (const block of message.content) {
          if (block.type !== 'tool_use') continue
          yield { type: 'tool', call: { id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } } }
        }
        yield {
          type: 'done',
          stop: STOPS[message.stop_reason ?? ''] ?? 'end',
          replay: { id: serverOf(c), model: message.model, blocks: message.content }
        }
      } catch (err) {
        throw friendly(err, c.profile)
      }
    },

    async complete(req) {
      const c = config()
      try {
        const message = await client(c).beta.messages.create(params(c, req, Math.max(req.maxTokens ?? 0, MIN_COMPLETE_TOKENS)))
        const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
        return { text: text.trim(), model: message.model }
      } catch (err) {
        throw friendly(err, c.profile)
      }
    }
  }
}

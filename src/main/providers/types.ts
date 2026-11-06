// What Otty needs from a model service. Code outside `providers/` only uses these shapes.

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** A service's own record of a reply, sent back to it unchanged. Other services ignore it. */
export interface ProviderReplay {
  id: string
  model: string
  blocks: unknown[]
}

/** Otty's own message format, in OpenAI's shape. Saved chats use it, so other providers translate as they send. */
export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[]; reasoning_content?: string; provider?: ProviderReplay }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ChatRequest {
  system?: string
  messages: Message[]
  tools?: readonly object[]
  /** Don't let the model call them this time. */
  toolsOff?: boolean
  /** Let the service search the web by itself, if it can. It isn't in `tools`, so it has to be asked for here. */
  serverSearch?: boolean
  maxTokens?: number
  /** How hard to think. Left out, the user's setting decides. */
  reasoning?: 'least' | 'normal' | 'deep'
}

/** `paused` means a long server-side turn stopped part way, and sending the same chat again resumes it. */
export type StopReason = 'end' | 'tools' | 'length' | 'refusal' | 'paused'

export type ProviderEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  /** One whole tool call, once all its pieces have arrived. */
  | { type: 'tool'; call: ToolCall }
  /** The service is searching the web itself. */
  | { type: 'search'; status: 'running' | 'done' }
  | { type: 'done'; stop: StopReason; replay?: ProviderReplay }

export interface Completion {
  text: string
  /** The model that answered, when the service says. */
  model?: string
}

export interface Provider {
  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>
  complete(req: ChatRequest): Promise<Completion>
}

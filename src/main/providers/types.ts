// What Otty needs from a model service. Code outside `providers/` only uses these shapes.

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** Otty's own message format, in OpenAI's shape. Saved chats use it, so other providers translate as they send. */
export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[]; reasoning_content?: string }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ChatRequest {
  system?: string
  messages: Message[]
  tools?: readonly object[]
  maxTokens?: number
  /** How hard to think. Left out, the user's setting decides. */
  reasoning?: 'least' | 'normal' | 'deep'
}

export type StopReason = 'end' | 'tools' | 'length' | 'refusal'

export type ProviderEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  /** One whole tool call, once all its pieces have arrived. */
  | { type: 'tool'; call: ToolCall }
  | { type: 'done'; stop: StopReason }

export interface Completion {
  text: string
  /** The model that answered, when the service says. */
  model?: string
}

export interface Provider {
  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>
  complete(req: ChatRequest): Promise<Completion>
}

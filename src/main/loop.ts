import { FriendlyError, type ChatRequest, type Message, type Provider, type ProviderReplay, type ToolCall } from './providers'
import { runTool, toolLabel, type ToolContext, type ToolOutcome } from './tools'

// The tool loop: ask the model, run what it calls, and ask again until it answers. It knows nothing about chats, so
// a chat turn and a background job (D-22) can share it. Whoever calls it owns the history and what happens on failure.

/** What a turn reports as it goes. The chat shows these; a job would save them. */
export type LoopEvent =
  | { type: 'text'; text: string }
  /** The service is searching by itself. `round` tells one search's chip from the next. */
  | { type: 'search'; status: 'running' | 'done'; round: number }
  | { type: 'tool'; callId: string; label: string; icon: string; status: 'running' | ToolOutcome['status']; copy?: string }
  /** A tool ran. `outcome` is the whole result, for anything that needs more than the chip. */
  | { type: 'tool-result'; name: string; outcome: ToolOutcome }

export interface LoopOptions {
  provider: () => Provider
  system: string
  /** Grows as the turn goes on. Nothing already in it is changed, so a cached prefix stays valid. */
  history: Message[]
  /** Read each round, so a settings change applies straight away. */
  tools: () => readonly object[]
  context: ToolContext
  /** Tool rounds allowed. One more request follows with tools off, so the model has to answer. */
  maxRounds: number
  signal: AbortSignal
  /** How hard to think this turn. Left out, the user's setting decides. */
  reasoning?: ChatRequest['reasoning']
  /** Asked before each request. True ends the tools early, and the next request has to answer. */
  stopTools?: () => boolean
  /** Told to the model when its tools end, so it can write up what it has. */
  wrapUp?: string
  /** Picks up a history that stopped part way: tool calls with no result yet run first. */
  resume?: boolean
  onEvent(e: LoopEvent): void
  /** Each message as it's added to `history`. */
  onMessage?(m: Message): void
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try {
    return JSON.parse(call.function.arguments || '{}')
  } catch {
    return {} /* the model sent bad JSON; the tool sees empty args */
  }
}

/** The tool calls in the last reply that have no result yet. */
export function unanswered(history: Message[]): ToolCall[] {
  const at = history.map((m) => m.role).lastIndexOf('assistant')
  const reply = history[at]
  if (reply?.role !== 'assistant' || !reply.tool_calls) return []
  const answered = new Set(history.slice(at).flatMap((m) => (m.role === 'tool' ? [m.tool_call_id] : [])))
  return reply.tool_calls.filter((c) => !answered.has(c.id))
}

export async function runLoop(o: LoopOptions): Promise<void> {
  const add = (m: Message) => {
    o.history.push(m)
    o.onMessage?.(m)
  }

  const runCalls = async (calls: ToolCall[]) => {
    for (const call of calls) {
      const args = parseArgs(call)
      const { label, icon, show = 'running' } = toolLabel(call.function.name, args)
      if (show === 'running') o.onEvent({ type: 'tool', callId: call.id, label, icon, status: 'running' })
      const out = await runTool(call.function.name, args, o.context)
      if (o.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      if (show !== 'never') o.onEvent({ type: 'tool', callId: call.id, label: out.chip?.label ?? label, icon, status: out.status, ...(out.chip?.copy ? { copy: out.chip.copy } : {}) })
      o.onEvent({ type: 'tool-result', name: call.function.name, outcome: out })
      add({ role: 'tool', tool_call_id: call.id, content: out.result })
    }
  }

  if (o.resume) await runCalls(unanswered(o.history))

  // Claude's own search isn't in the tool list, so an allowed list has to switch it off separately.
  const serverSearch = !o.context.allowed || o.context.allowed.has('search_web')

  let wrapped = false
  for (let round = 0; round <= o.maxRounds; round++) {
    const toolsOff = Boolean(o.stopTools?.()) || round >= o.maxRounds
    if (toolsOff && o.wrapUp && !wrapped) {
      wrapped = true
      add({ role: 'user', content: o.wrapUp })
    }
    const replies = o.provider().stream(
      { system: o.system, messages: o.history, tools: o.tools(), toolsOff, serverSearch, ...(o.reasoning ? { reasoning: o.reasoning } : {}) },
      o.signal
    )

    let content = ''
    let reasoning = ''
    const toolCalls: ToolCall[] = []
    let replay: ProviderReplay | undefined
    let paused = false

    for await (const event of replies) {
      if (event.type === 'reasoning') reasoning += event.text
      if (event.type === 'tool') toolCalls.push(event.call)
      if (event.type === 'done') {
        if (event.stop === 'refusal') throw new FriendlyError('Otty can’t help with that one. Try asking in a different way.')
        replay = event.replay
        paused = event.stop === 'paused'
      }
      if (event.type === 'search') o.onEvent({ type: 'search', status: event.status, round })
      if (event.type === 'text') {
        content += event.text
        o.onEvent({ type: 'text', text: event.text })
      }
    }

    add({
      role: 'assistant',
      content: content || null,
      ...(toolCalls.length && !toolsOff ? { tool_calls: toolCalls } : {}),
      ...(reasoning ? { reasoning_content: reasoning } : {}),
      ...(replay ? { provider: replay } : {})
    })
    if (paused) continue // the same chat, sent again, resumes it
    if (!toolCalls.length || toolsOff) return
    await runCalls(toolCalls)
  }
}

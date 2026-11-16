/** Anthropic's Messages API (Claude, and other Anthropic-style servers) for the fake world, streamed and not. */
import type { ServerResponse } from 'http'
import { DEFAULT_USAGE, pieces, type Turn } from './turn'

let ids = 0

const STOP = { length: 'max_tokens', refusal: 'refusal' } as const

type Block = Record<string, unknown> & { type: string }

/** A thinking block's signature. The server signs what it wrote, so a replayed one can be checked byte for byte. */
export const signatureFor = (thinking: string) => `smoke-sig-${Buffer.from(thinking).toString('base64').slice(0, 24)}`

/** The finished reply's content, in the order Claude writes it: thinking, its own searches, the text, tool calls. */
function blocks(turn: Turn): Block[] {
  const out: Block[] = []
  if (turn.think) out.push({ type: 'thinking', thinking: turn.think, signature: signatureFor(turn.think) })
  for (const s of turn.searches ?? []) {
    const id = `srvtoolu_smoke_${++ids}`
    out.push({ type: 'server_tool_use', id, name: 'web_search', input: { query: s.query } })
    out.push({
      type: 'web_search_tool_result',
      tool_use_id: id,
      content: s.results.map((r) => ({ type: 'web_search_result', url: r.url, title: r.title, encrypted_content: 'smoke', page_age: r.age ?? null }))
    })
  }
  if (turn.say) out.push({ type: 'text', text: turn.say })
  for (const c of turn.calls ?? []) out.push({ type: 'tool_use', id: `toolu_smoke_${++ids}`, name: c.name, input: c.args })
  return out
}

function stopReason(turn: Turn): string {
  if (turn.stop) return STOP[turn.stop]
  return turn.calls?.length ? 'tool_use' : 'end_turn'
}

/** Anthropic counts cached input apart: `input_tokens` is only what wasn't read from the cache. */
function usage(turn: Turn) {
  const u = turn.usage ?? DEFAULT_USAGE
  const cached = u.cached ?? 0
  return { input_tokens: u.input - cached, output_tokens: u.output, ...(u.cached !== undefined ? { cache_read_input_tokens: cached } : {}) }
}

function message(turn: Turn, model: string, content: Block[]) {
  return { id: `msg_smoke_${++ids}`, type: 'message', role: 'assistant', model, content, stop_reason: null as string | null, stop_sequence: null, usage: usage(turn) }
}

export function anthropicStream(res: ServerResponse, turn: Turn, body: { model?: string }): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (event: Record<string, unknown> & { type: string }) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  const start = message(turn, body.model ?? 'smoke-model', [])
  send({ type: 'message_start', message: { ...start, usage: { ...start.usage, output_tokens: 1 } } })
  blocks(turn).forEach((block, index) => {
    const deltas: object[] = []
    let opening: Block = block
    if (block.type === 'thinking') {
      opening = { type: 'thinking', thinking: '', signature: '' }
      deltas.push({ type: 'thinking_delta', thinking: block.thinking }, { type: 'signature_delta', signature: block.signature })
    } else if (block.type === 'text') {
      opening = { type: 'text', text: '' }
      for (const piece of pieces(String(block.text))) deltas.push({ type: 'text_delta', text: piece })
    } else if (block.type === 'tool_use' || block.type === 'server_tool_use') {
      opening = { ...block, input: {} }
      deltas.push({ type: 'input_json_delta', partial_json: JSON.stringify(block.input) })
    }
    send({ type: 'content_block_start', index, content_block: opening })
    for (const delta of deltas) send({ type: 'content_block_delta', index, delta })
    send({ type: 'content_block_stop', index })
  })
  send({ type: 'message_delta', delta: { stop_reason: stopReason(turn), stop_sequence: null }, usage: { output_tokens: usage(turn).output_tokens } })
  send({ type: 'message_stop' })
  res.end()
}

export function anthropicComplete(res: ServerResponse, turn: Turn, body: { model?: string }): void {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ...message(turn, body.model ?? 'smoke-model', blocks(turn)), stop_reason: stopReason(turn) }))
}

const ERROR_TYPES: Record<number, string> = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  402: 'billing_error',
  403: 'permission_error',
  404: 'not_found_error',
  413: 'request_too_large',
  429: 'rate_limit_error',
  529: 'overloaded_error'
}

/** `x-should-retry: false` stops the SDK retrying, so a scripted failure is seen once, straight away. */
export function anthropicError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json', 'x-should-retry': 'false' })
  res.end(JSON.stringify({ type: 'error', error: { type: ERROR_TYPES[status] ?? 'api_error', message } }))
}

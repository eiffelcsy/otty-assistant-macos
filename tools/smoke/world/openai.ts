/** OpenAI-style chat completions (DeepSeek, OpenAI, custom addresses) for the fake world. */
import type { ServerResponse } from 'http'
import { DEFAULT_USAGE, pieces, type Turn } from './turn'

export type { Turn } from './turn'

let callIds = 0

const FINISH = { length: 'length', refusal: 'content_filter' } as const

function usage(turn: Turn) {
  const u = turn.usage ?? DEFAULT_USAGE
  return { prompt_tokens: u.input, completion_tokens: u.output, ...(u.cached !== undefined ? { prompt_cache_hit_tokens: u.cached, prompt_cache_miss_tokens: u.input - u.cached } : {}) }
}

function finish(turn: Turn): string {
  if (turn.stop) return FINISH[turn.stop]
  return turn.calls?.length ? 'tool_calls' : 'stop'
}

export function openAiStream(res: ServerResponse, turn: Turn, body: { model?: string }): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (delta: object, reason: string | null = null) =>
    res.write(`data: ${JSON.stringify({ id: 'smoke', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`)
  if (turn.think) send({ reasoning_content: turn.think })
  for (const piece of pieces(turn.say ?? '')) send({ content: piece })
  turn.calls?.forEach((c, index) =>
    send({ tool_calls: [{ index, id: `call_${++callIds}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }] })
  )
  send({}, finish(turn))
  res.write(`data: ${JSON.stringify({ id: 'smoke', choices: [], usage: usage(turn) })}\n\n`)
  res.end('data: [DONE]\n\n')
}

export function openAiComplete(res: ServerResponse, turn: Turn, body: { model?: string }): void {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(
    JSON.stringify({
      id: 'smoke',
      model: body.model ?? 'smoke-model',
      choices: [{ index: 0, message: { role: 'assistant', content: turn.say ?? '' }, finish_reason: finish(turn) }],
      usage: usage(turn)
    })
  )
}

export function openAiError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: { message, type: 'smoke_error' } }))
}

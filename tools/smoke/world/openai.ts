/** OpenAI-style chat completions (DeepSeek, OpenAI, custom addresses) for the fake world. */
import type { ServerResponse } from 'http'

/** One scripted model reply, in a shape that doesn't depend on the API format. */
export interface Turn {
  say?: string
  think?: string
  calls?: { name: string; args: Record<string, unknown> }[]
  usage?: { input: number; output: number; cached?: number }
  /** Answer with this HTTP status instead. */
  status?: number
  error?: string
}

let callIds = 0

function usage(turn: Turn) {
  const u = turn.usage ?? { input: 100, output: 20 }
  return { prompt_tokens: u.input, completion_tokens: u.output, ...(u.cached !== undefined ? { prompt_cache_hit_tokens: u.cached, prompt_cache_miss_tokens: u.input - u.cached } : {}) }
}

/** The reply split into a few chunks, so streaming code sees more than one. */
function pieces(text: string): string[] {
  const words = text.split(/(?<= )/)
  const size = Math.max(1, Math.ceil(words.length / 4))
  const out: string[] = []
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(''))
  return out
}

export function openAiStream(res: ServerResponse, turn: Turn, body: { model?: string }): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (delta: object, finish: string | null = null, extra: object = {}) =>
    res.write(`data: ${JSON.stringify({ id: 'smoke', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`)
  if (turn.think) send({ reasoning_content: turn.think })
  for (const piece of pieces(turn.say ?? '')) send({ content: piece })
  turn.calls?.forEach((c, index) =>
    send({ tool_calls: [{ index, id: `call_${++callIds}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }] })
  )
  send({}, turn.calls?.length ? 'tool_calls' : 'stop')
  res.write(`data: ${JSON.stringify({ id: 'smoke', choices: [], usage: usage(turn) })}\n\n`)
  res.end('data: [DONE]\n\n')
}

export function openAiComplete(res: ServerResponse, turn: Turn, body: { model?: string }): void {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ id: 'smoke', model: body.model ?? 'smoke-model', choices: [{ index: 0, message: { role: 'assistant', content: turn.say ?? '' }, finish_reason: 'stop' }], usage: usage(turn) }))
}

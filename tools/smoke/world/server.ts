/**
 * The fake world for smoke runs (D-47): a model, search and web pages on 127.0.0.1, in the test process.
 * The smoke build sends every request here as `/<host><path>`, with the original address in `x-smoke-url`.
 * Anything not scripted is refused and remembered, so the test fails instead of the app quietly getting nothing.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { openAiStream, openAiComplete, type Turn } from './openai'

export type { Turn } from './openai'

export interface SeenRequest {
  url: string
  method: string
  /** Parsed JSON body, or the raw text. */
  body: unknown
  authorization?: string
}

type Match = string | RegExp | ((lastUserText: string, body: ModelBody) => boolean)

export interface ModelBody {
  model?: string
  stream?: boolean
  messages?: { role: string; content?: unknown }[]
  tools?: { function?: { name: string } }[]
}

interface Script {
  match: Match
  turns: Turn[]
  used: number
}

export interface Page {
  status?: number
  html?: string
  /** For a redirect. */
  location?: string
  contentType?: string
}

/** Text of a message's content, whatever its shape. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('\n')
  return ''
}

export function lastUserText(body: ModelBody): string {
  const user = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user')
  return user ? textOf(user.content) : ''
}

function matches(m: Match, text: string, body: ModelBody): boolean {
  if (typeof m === 'string') return text.includes(m)
  if (m instanceof RegExp) return m.test(text)
  return m(text, body)
}

export class World {
  readonly requests: SeenRequest[] = []
  /** Requests nobody scripted. Each fails the test. */
  readonly unscripted: string[] = []
  private scripts: Script[] = []
  private pages = new Map<string, Page>()
  private server: Server | null = null
  /** Background calls (titles, explain warm-ups) get this unless a script matches. */
  backgroundReply = 'Smoke chat'

  /** Reply to the next model requests whose latest user words match. A list answers one request each, in order. */
  reply(match: Match, ...turns: Turn[]): this {
    this.scripts.push({ match, turns, used: 0 })
    return this
  }

  page(url: string, page: Page | string): this {
    this.pages.set(url, typeof page === 'string' ? { html: page } : page)
    return this
  }

  /** The model requests the app sent, newest last. */
  modelRequests(): ModelBody[] {
    return this.requests.filter((r) => r.url.endsWith('/chat/completions') || r.url.endsWith('/v1/messages')).map((r) => r.body as ModelBody)
  }

  reset(): void {
    this.requests.length = 0
    this.unscripted.length = 0
    this.scripts = []
    this.pages.clear()
    this.backgroundReply = 'Smoke chat'
  }

  async start(): Promise<string> {
    const server = createServer((req, res) => void this.handle(req, res).catch((err) => this.fail(res, `world error: ${String(err)}`)))
    this.server = server
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  async stop(): Promise<void> {
    if (!this.server) return
    this.server.closeAllConnections()
    await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    this.server = null
  }

  private fail(res: ServerResponse, why: string): void {
    this.unscripted.push(why)
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: why } }))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = String(req.headers['x-smoke-url'] ?? '')
    const raw = await new Promise<string>((resolve) => {
      let data = ''
      req.on('data', (c) => (data += c))
      req.on('end', () => resolve(data))
    })
    let body: unknown = raw
    try {
      body = raw ? JSON.parse(raw) : undefined
    } catch {
      /* not JSON */
    }
    const authorization = req.headers['authorization'] ? String(req.headers['authorization']) : undefined
    this.requests.push({ url, method: req.method ?? 'GET', body, ...(authorization ? { authorization } : {}) })

    if (url.endsWith('/chat/completions')) return this.model(res, body as ModelBody)
    const page = this.pages.get(url)
    if (page) {
      const headers: Record<string, string> = { 'content-type': page.contentType ?? 'text/html; charset=utf-8' }
      if (page.location) headers['location'] = page.location
      res.writeHead(page.status ?? (page.location ? 302 : 200), headers)
      res.end(page.html ?? '')
      return
    }
    this.fail(res, `no page scripted for ${req.method} ${url}`)
  }

  private model(res: ServerResponse, body: ModelBody): void {
    const text = lastUserText(body)
    const script = this.scripts.find((s) => s.used < s.turns.length && matches(s.match, text, body))
    if (!script) {
      if (!body.stream) return openAiComplete(res, { say: this.backgroundReply }, body)
      return this.fail(res, `no reply scripted for: ${text.slice(0, 120)}`)
    }
    const turn = script.turns[script.used++]
    if (turn.status) {
      res.writeHead(turn.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: turn.error ?? 'scripted failure' } }))
      return
    }
    if (body.stream) openAiStream(res, turn, body)
    else openAiComplete(res, turn, body)
  }
}

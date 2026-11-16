/**
 * The fake world for smoke runs (D-47): a model, search and web pages on 127.0.0.1, in the test process.
 * The smoke build sends every request here as `/<host><path>`, with the original address in `x-smoke-url`.
 * Anything not scripted is refused and remembered, so the test fails instead of the app quietly getting nothing.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { anthropicComplete, anthropicError, anthropicStream } from './anthropic'
import { openAiComplete, openAiError, openAiStream } from './openai'
import {
  ddgAnswer,
  deepseekResults,
  matchesQuery,
  searchService,
  wikiKey,
  wikiSearch,
  wikiSummary,
  type Failure,
  type LookupAnswer,
  type QueryMatch,
  type ReadResult,
  type SearchResult
} from './search'
import type { Turn } from './turn'

export type { Turn } from './turn'
export type { LookupAnswer, QueryMatch, ReadResult, SearchResult } from './search'

export interface SeenRequest {
  url: string
  method: string
  /** Parsed JSON body, or the raw text. */
  body: unknown
  authorization?: string
  /** Anthropic-style servers take the key here. */
  apiKey?: string
}

type Match = string | RegExp | ((lastUserText: string, body: ModelBody) => boolean)

/** A model request, in either format. Anthropic's has `system` apart; OpenAI's has it as the first message. */
export interface ModelBody {
  model?: string
  stream?: boolean
  system?: unknown
  messages?: { role: string; content?: unknown }[]
  /** OpenAI's tools are `{ function: { name } }`; Anthropic's are `{ name }`, and its own search has a `type`. */
  tools?: { function?: { name: string }; name?: string; type?: string }[]
}

export type ModelFormat = 'openai' | 'anthropic'

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

/** True for a message the user wrote, not one that only carries tool results (Anthropic sends those as `user`). */
function fromUser(m: { role: string; content?: unknown }): boolean {
  if (m.role !== 'user') return false
  return typeof m.content === 'string' || (Array.isArray(m.content) && m.content.some((p) => p && typeof p === 'object' && (p as { type?: string }).type === 'text'))
}

export function lastUserText(body: ModelBody): string {
  const user = [...(body.messages ?? [])].reverse().find(fromUser)
  return user ? textOf(user.content) : ''
}

/** The names of the tools a request offered, in either format. Claude's own search shows as its `name`. */
export function toolNames(body: ModelBody): string[] {
  return (body.tools ?? []).map((t) => t.function?.name ?? t.name ?? '')
}

/** Which API format a request is in, by its address. */
export function modelFormat(url: string): ModelFormat | null {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }
  if (path.endsWith('/chat/completions')) return 'openai'
  if (path.endsWith('/v1/messages')) return 'anthropic'
  return null
}

function matches(m: Match, text: string, body: ModelBody): boolean {
  if (typeof m === 'string') return text.includes(m)
  if (m instanceof RegExp) return m.test(text)
  return m(text, body)
}

/** A string field of a JSON body, or ''. */
const field = (body: unknown, name: string): string => {
  const v = body && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined
  return typeof v === 'string' ? v : ''
}

const isFailure = (x: unknown): x is Failure => Boolean(x && typeof x === 'object' && 'status' in x)

export class World {
  readonly requests: SeenRequest[] = []
  /** Requests nobody scripted. Each fails the test. */
  readonly unscripted: string[] = []
  private scripts: Script[] = []
  private pages = new Map<string, Page>()
  private searches: { match: QueryMatch; answer: SearchResult[] | Failure }[] = []
  private reads = new Map<string, ReadResult | Failure>()
  private lookups: { match: QueryMatch; answer: LookupAnswer }[] = []
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

  /** DeepSeek's search: every query that matches gets these results, or fails with `{ status }`. */
  search(match: QueryMatch, answer: SearchResult[] | Failure): this {
    this.searches.push({ match, answer })
    return this
  }

  /** DeepSeek's page reader, for this exact address. A string is the page's text. */
  read(url: string, answer: ReadResult | Failure | string): this {
    this.reads.set(url, typeof answer === 'string' ? { content: answer } : answer)
    return this
  }

  /** The keyless lookup: DuckDuckGo and Wikipedia both answer a matching query (empty where `answer` has nothing). */
  lookup(match: QueryMatch, answer: LookupAnswer): this {
    this.lookups.push({ match, answer })
    return this
  }

  /** The model requests the app sent, newest last. */
  modelRequests(format?: ModelFormat): ModelBody[] {
    return this.requests.filter((r) => (format ? modelFormat(r.url) === format : modelFormat(r.url))).map((r) => r.body as ModelBody)
  }

  /** The streamed model requests: the user's turns, not titles, explain warm-ups or connection tests. */
  turnRequests(format?: ModelFormat): ModelBody[] {
    return this.modelRequests(format).filter((b) => b.stream)
  }

  reset(): void {
    this.requests.length = 0
    this.unscripted.length = 0
    this.scripts = []
    this.pages.clear()
    this.searches = []
    this.reads.clear()
    this.lookups = []
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

  private fail(res: ServerResponse, why: string, format: ModelFormat = 'openai'): void {
    this.unscripted.push(why)
    if (res.headersSent) return void res.end()
    if (format === 'anthropic') anthropicError(res, 500, why)
    else openAiError(res, 500, why)
  }

  private json(res: ServerResponse, body: object, status = 200): void {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Without the smoke build in front (the contract test), the path itself is `/<host><path>`.
    const url = String(req.headers['x-smoke-url'] ?? `https:/${req.url ?? '/'}`)
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
    const apiKey = req.headers['x-api-key'] ? String(req.headers['x-api-key']) : undefined
    this.requests.push({ url, method: req.method ?? 'GET', body, ...(authorization ? { authorization } : {}), ...(apiKey ? { apiKey } : {}) })

    const format = modelFormat(url)
    if (format) return this.model(res, body as ModelBody, format)
    const service = searchService(url)
    if (service) return this.searchService(res, service, url, body)
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

  private searchService(res: ServerResponse, service: NonNullable<ReturnType<typeof searchService>>, url: string, body: unknown): void {
    const u = new URL(url)
    const lookup = (q: string) => this.lookups.find((l) => matchesQuery(l.match, q))?.answer
    switch (service) {
      case 'deepseek-search': {
        const query = field(body, 'query')
        const found = this.searches.find((s) => matchesQuery(s.match, query))
        if (!found) return this.fail(res, `no search scripted for: ${query}`)
        if (isFailure(found.answer)) return this.json(res, { error: { message: 'scripted failure' } }, found.answer.status)
        return this.json(res, deepseekResults(found.answer))
      }
      case 'deepseek-fetch': {
        const address = field(body, 'url')
        const found = this.reads.get(address)
        if (!found) return this.fail(res, `no page scripted for DeepSeek's reader: ${address}`)
        if (isFailure(found)) return this.json(res, { error: { message: 'scripted failure' } }, found.status)
        return this.json(res, { title: found.title ?? '', content: found.content })
      }
      case 'ddg':
      case 'wiki-search': {
        const query = u.searchParams.get('q') ?? ''
        const answer = lookup(query)
        if (!answer) return this.fail(res, `no lookup scripted for: ${query}`)
        return this.json(res, service === 'ddg' ? ddgAnswer(answer) : wikiSearch(answer))
      }
      case 'wiki-summary': {
        const key = decodeURIComponent(u.pathname.split('/').pop() ?? '')
        const page = this.lookups.flatMap((l) => l.answer.wiki ?? []).find((w) => wikiKey(w.title) === key)
        if (!page) return this.fail(res, `no Wikipedia page scripted for: ${key}`)
        return this.json(res, wikiSummary(page))
      }
    }
  }

  private model(res: ServerResponse, body: ModelBody, format: ModelFormat): void {
    const text = lastUserText(body)
    const script = this.scripts.find((s) => s.used < s.turns.length && matches(s.match, text, body))
    const complete = format === 'anthropic' ? anthropicComplete : openAiComplete
    if (!script) {
      if (!body.stream) return complete(res, { say: this.backgroundReply }, body)
      return this.fail(res, `no reply scripted for: ${text.slice(0, 120)}`, format)
    }
    const turn = script.turns[script.used++]
    if (turn.status) return (format === 'anthropic' ? anthropicError : openAiError)(res, turn.status, turn.error ?? 'scripted failure')
    if (!body.stream) return complete(res, turn, body)
    if (format === 'anthropic') anthropicStream(res, turn, body)
    else openAiStream(res, turn, body)
  }
}

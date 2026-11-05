// DeepSeek's Search and Fetch APIs (D-9): real web search and page reading with the key users already have.
// No Electron imports, so it can be tested on its own. `tools.ts` decides when to use it.

import { serviceAt } from '../shared/services'

/** Where and how to call DeepSeek. */
export interface WebConfig {
  baseUrl: string
  key: string
}

const SEARCH_COUNT = 5
/** About 6K tokens of page: enough for an article, small enough to leave room for the answer. */
const PAGE_MAX_CHARS = 24_000
const TIMEOUT_MS = 15_000

/** True when the base URL is DeepSeek's own API, the only one with these endpoints. */
export function isDeepSeek(baseUrl: string): boolean {
  return serviceAt(baseUrl) === 'deepseek'
}

/** A failure the model can pass on in plain words. `fallback` = worth trying another search. */
export class WebError extends Error {
  constructor(
    message: string,
    readonly fallback: boolean
  ) {
    super(message)
  }
}

async function post(cfg: WebConfig, path: string, body: object, fetchImpl: typeof fetch): Promise<any> {
  const url = `${new URL(cfg.baseUrl).origin}${path}`
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch {
      throw new WebError('The web lookup timed out or couldn’t connect.', true)
    }
    if (res.ok) return res.json()
    // Busy: one quick retry, as the API docs suggest.
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 800))
      continue
    }
    throw statusError(res.status, path)
  }
}

function statusError(status: number, path: string): WebError {
  const page = path.endsWith('/fetch')
  if (status === 401) return new WebError('The DeepSeek key was refused.', false)
  if (status === 402) return new WebError('The DeepSeek balance is empty, so Otty can’t look things up on the web right now.', true)
  if (page && (status === 403 || status === 404)) {
    return new WebError(
      'That page couldn’t be read. It may need a sign-in, block automated reading, or have no text. Otty’s reader can’t see pages the user is signed in to.',
      false
    )
  }
  if (status === 429) return new WebError('Too many web lookups at once. Try again in a moment.', true)
  return new WebError(`The web lookup failed (error ${status}).`, true)
}

interface SearchResult {
  title: string
  url: string
  summary?: string
  snippet?: string
  site_name?: string | null
  date?: string | null
}

/** Searches the web. Returns text for the model: one block per result, with its source to cite. */
export async function deepseekSearch(cfg: WebConfig, query: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const q = query.trim().slice(0, 128)
  if (!q) return 'No search query was given.'
  const json = await post(cfg, '/v1/tools/search', { query: q, count: SEARCH_COUNT, need_content: false }, fetchImpl)
  const results: SearchResult[] = Array.isArray(json?.results) ? json.results : []
  if (!results.length) return 'No web results found.'
  return results
    .map((r, i) => {
      const meta = [r.site_name, r.date?.slice(0, 10)].filter(Boolean).join(', ')
      return `[${i + 1}] ${r.title}${meta ? ` (${meta})` : ''}\n${r.url}\n${(r.summary || r.snippet || '').trim()}`
    })
    .join('\n\n')
}

/** Reads one web page as Markdown, cut to a size the model can use. */
/** A safe, ordinary web address, or a message saying why not. */
export function checkedUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new WebError('That isn’t a web address Otty can read.', false)
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new WebError('Otty can only read ordinary http(s) web pages.', false)
  }
  return parsed
}

/** A page as the model sees it, cut to a size that fits. */
export function formatPage(title: string, href: string, content: string): string {
  const cut = content.length > PAGE_MAX_CHARS
  const body = cut ? content.slice(0, PAGE_MAX_CHARS) : content
  const note = cut ? `\n\n[Only the first ${PAGE_MAX_CHARS.toLocaleString('en')} of ${content.length.toLocaleString('en')} characters were included.]` : ''
  return `${title ? `# ${title}\n` : ''}Source: ${href}\n\n${body}${note}`
}

export async function deepseekFetch(cfg: WebConfig, url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const parsed = checkedUrl(url)
  const json = await post(cfg, '/v1/tools/fetch', { url: parsed.href }, fetchImpl)
  const content = String(json?.content ?? '').trim()
  if (!content) throw new WebError('That page had no text Otty could read.', false)
  return formatPage(String(json?.title ?? '').trim(), parsed.href, content)
}

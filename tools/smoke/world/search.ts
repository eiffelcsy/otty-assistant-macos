/**
 * The search and reading services the app calls (D-47): DeepSeek's Search and Fetch APIs (`src/main/web.ts`), and the
 * keyless lookup's DuckDuckGo and Wikipedia (`lookup` in `src/main/tools.ts`). Each answers only what a spec scripted.
 */

export type QueryMatch = string | RegExp | ((query: string) => boolean)

export function matchesQuery(m: QueryMatch, query: string): boolean {
  if (typeof m === 'string') return query.toLowerCase().includes(m.toLowerCase())
  if (m instanceof RegExp) return m.test(query)
  return m(query)
}

/** One DeepSeek search result. `site` defaults to the address's host and `date` to none. */
export interface SearchResult {
  title: string
  url: string
  summary?: string
  site?: string
  /** ISO date, e.g. '2026-11-10'. */
  date?: string
}

/** A failed lookup instead of results. */
export interface Failure {
  status: number
}

/** What DeepSeek's reader returns for an address. */
export interface ReadResult {
  title?: string
  content: string
}

/** What the keyless lookup finds: a DuckDuckGo instant answer and Wikipedia pages, either or both. */
export interface LookupAnswer {
  abstract?: { text: string; url: string }
  wiki?: { title: string; extract: string; url?: string }[]
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function deepseekResults(results: SearchResult[]): object {
  return {
    results: results.map((r) => ({
      title: r.title,
      url: r.url,
      summary: r.summary ?? '',
      site_name: r.site ?? hostOf(r.url),
      date: r.date ?? null
    }))
  }
}

export const wikiKey = (title: string) => title.replace(/ /g, '_')

export const ddgAnswer = (a: LookupAnswer): object => (a.abstract ? { AbstractText: a.abstract.text, AbstractURL: a.abstract.url } : { AbstractText: '', AbstractURL: '' })

export const wikiSearch = (a: LookupAnswer): object => ({ pages: (a.wiki ?? []).map((w) => ({ id: 1, key: wikiKey(w.title), title: w.title })) })

export function wikiSummary(w: NonNullable<LookupAnswer['wiki']>[number]): object {
  return { title: w.title, extract: w.extract, content_urls: { desktop: { page: w.url ?? `https://en.wikipedia.org/wiki/${wikiKey(w.title)}` } } }
}

/** Which service an address belongs to, if it's one of these. */
export function searchService(url: string): 'deepseek-search' | 'deepseek-fetch' | 'ddg' | 'wiki-search' | 'wiki-summary' | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.host === 'api.deepseek.com' && u.pathname === '/v1/tools/search') return 'deepseek-search'
  if (u.host === 'api.deepseek.com' && u.pathname === '/v1/tools/fetch') return 'deepseek-fetch'
  if (u.host === 'api.duckduckgo.com' && u.pathname === '/') return 'ddg'
  if (u.host === 'en.wikipedia.org' && u.pathname === '/w/rest.php/v1/search/page') return 'wiki-search'
  if (u.host === 'en.wikipedia.org' && u.pathname.startsWith('/api/rest_v1/page/summary/')) return 'wiki-summary'
  return null
}

import { readPageFromMac } from '../pageReader'
import { profileFor, searchesOnServer } from '../providers/profiles'
import { getApiKey, getStored } from '../settings'
import { checkedUrl, deepseekFetch, deepseekSearch, WebError, type WebConfig } from '../web'
import { record } from '../sent'
import { send } from '../net'
import { maskSecrets } from '../../shared/secrets'
import { needsCard } from '../toolSafety'
import { pageCard, searchCard } from '../cards'
import { declined, hostOf, text, type Setup, type Tool, type ToolContext } from './types'

// The tools that bring in the open web. Every request still leaves through `send` (D-52).

/** True when nothing should leave the Mac. */
export const webOff = (): boolean => profileFor(getStored().baseUrl).web === 'off'

/** DeepSeek's key and origin, when the user's provider is DeepSeek; null otherwise. */
function webConfig(): WebConfig | null {
  const { baseUrl } = getStored()
  const key = getApiKey()
  return key && profileFor(baseUrl).web === 'deepseek' ? { baseUrl, key } : null
}

/** How this setup reaches the web. Claude brings its own search, and pages are read from the Mac unless DeepSeek does it. */
export function webSetup(): Setup['web'] {
  if (webOff()) return 'off'
  if (webConfig()) return 'deepseek'
  const { baseUrl, apiFormat, model } = getStored()
  return searchesOnServer(profileFor(baseUrl, apiFormat), model) ? 'server' : 'lookup'
}

/** Where a lookup went. Called just before it goes, so a failed one is still listed: it left either way. */
type Noter = (service: string, host: string) => void

function noter(ctx: ToolContext, kind: 'search' | 'page', what: string): Noter {
  return (service, host) => record({ kind, service, host, local: false, what, ...ctx.sent })
}

const offWeb = { result: 'Web lookups are off with this model.', status: 'error' } as const

const searchWebDef = {
  type: 'function',
  function: {
    name: 'search_web',
    description:
      'Search the web for current facts, news, prices, how-tos or anything you are unsure of. Returns up to 5 results with title, site, date, URL and a summary. Cite the ones you use as links.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A short search query (at most 128 characters), in the language the sources are likely in' } },
      required: ['query']
    }
  }
} as const

/** The old, keyless search: for providers other than DeepSeek, and as a fallback. */
const lookupDef = {
  type: 'function',
  function: {
    name: 'search_web',
    description:
      'Look up facts about a topic. Returns short summaries from Wikipedia and DuckDuckGo instant answers. Best for "what is / who is" questions.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to look up, e.g. "photosynthesis"' } },
      required: ['query']
    }
  }
} as const

const readPageDef = {
  type: 'function',
  function: {
    name: 'read_page',
    description:
      'Read a web page and get its text as Markdown. Use it on the address in the app note when the user asks about "this page", or on a search result worth reading in full. It cannot see pages that need the user to be signed in.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Full http(s) URL' } },
      required: ['url']
    }
  }
} as const

export const searchWebTool: Tool = {
  offer: ({ web }) => (web === 'deepseek' ? searchWebDef : web === 'lookup' ? lookupDef : null),
  label: (args) => ({ icon: 'search', label: `Looking up “${text(args, 'query')}”` }),
  async run(args, ctx) {
    // A model can call this even when it isn't offered, so "nothing leaves the Mac" is enforced here too.
    if (webOff()) return offWeb
    const query = text(args, 'query')
    // D-41: once private data and outside words meet, the model's own query is shown before it leaves. The other
    // tools that send words out always ask (open_url, jobs), or only go to addresses Otty already knows (read_page).
    if (needsCard('search_web', ctx.taint) && !(await ctx.confirm(searchCard(query, webConfig() ? 'DeepSeek' : 'Wikipedia and DuckDuckGo')))) return declined
    return { result: await searchWeb(query, noter(ctx, 'search', query)), status: 'done' }
  }
}

export const readPageTool: Tool = {
  offer: ({ web }) => (web === 'off' ? null : readPageDef),
  label: (args) => ({ icon: 'book-open-reader', label: `Reading ${hostOf(text(args, 'url'))}` }),
  async run(args, ctx) {
    if (webOff()) return offWeb
    const web = webConfig()
    let url: string
    try {
      // Parsed before the check, as the reader will parse it: `https:evil.com` or a leading space is still an address.
      url = checkedUrl(text(args, 'url')).href
    } catch (err) {
      if (err instanceof WebError) return { result: err.message, status: 'error' }
      throw err
    }
    if (!ctx.knownUrl(url) && !(await ctx.confirm(pageCard('read', url), url))) return declined
    noter(ctx, 'page', url)(web ? 'DeepSeek' : hostOf(url), web ? hostOf(web.baseUrl) : hostOf(url))
    try {
      // Someone else's page can hold a key too (a leaked config, a paste site), and it shouldn't be passed on.
      return { result: maskSecrets(await (web ? deepseekFetch(web, url) : readPageFromMac(url))).text, status: 'done' }
    } catch (err) {
      if (err instanceof WebError) return { result: err.message, status: 'error' }
      throw err
    }
  }
}

async function getJson(url: string): Promise<any> {
  const res = await send(url, {
    headers: { 'User-Agent': 'Otty/0.1 (desktop assistant)' },
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** DeepSeek's real search when available; Wikipedia and DuckDuckGo otherwise, or when it fails. */
async function searchWeb(query: string, note: Noter): Promise<string> {
  const web = webConfig()
  if (!web) return lookup(query, note)
  note('DeepSeek', hostOf(web.baseUrl))
  try {
    return await deepseekSearch(web, query)
  } catch (err) {
    if (!(err instanceof WebError)) throw err
    if (!err.fallback) return err.message
    console.warn('DeepSeek search failed, falling back:', err.message)
    return `${err.message} Here is a simpler lookup instead:\n\n${await lookup(query, note)}`
  }
}

async function lookup(query: string, note: Noter): Promise<string> {
  note('Wikipedia and DuckDuckGo', 'wikipedia.org')
  const q = encodeURIComponent(query)
  const parts: string[] = []

  const [ddg, wiki] = await Promise.allSettled([
    getJson(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`),
    getJson(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${q}&limit=3`)
  ])

  if (ddg.status === 'fulfilled' && ddg.value?.AbstractText) {
    parts.push(`DuckDuckGo: ${ddg.value.AbstractText} (${ddg.value.AbstractURL})`)
  }

  if (wiki.status === 'fulfilled') {
    const pages: any[] = wiki.value?.pages ?? []
    const summaries = await Promise.allSettled(
      pages.slice(0, 2).map((p) => getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`))
    )
    for (const s of summaries) {
      if (s.status === 'fulfilled' && s.value?.extract) {
        parts.push(`Wikipedia — ${s.value.title}: ${s.value.extract} (${s.value.content_urls?.desktop?.page ?? ''})`)
      }
    }
  }

  return parts.length ? parts.join('\n\n') : 'No results found.'
}

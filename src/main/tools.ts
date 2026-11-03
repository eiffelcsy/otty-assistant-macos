import { clipboard, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getApiKey, getStored } from './settings'
import { deepseekFetch, deepseekSearch, isDeepSeek, WebError, type WebConfig } from './web'

const run = promisify(execFile)

export interface ToolContext {
  /** Ask the user to approve a side-effecting action. */
  confirm(title: string, detail: string): Promise<boolean>
}

export interface ToolOutcome {
  result: string
  status: 'done' | 'denied' | 'error'
}

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

/** DeepSeek's key and origin, when the user's provider is DeepSeek; null otherwise. */
function webConfig(): WebConfig | null {
  const { baseUrl } = getStored()
  const key = getApiKey()
  return key && isDeepSeek(baseUrl) ? { baseUrl, key } : null
}

/** The tools offered to the model. Real search and page reading need DeepSeek's endpoints. */
export function toolDefs() {
  const web = webConfig() ? [searchWebDef, readPageDef] : [lookupDef]
  return [...web, ...otherDefs]
}

const otherDefs = [
  {
    type: 'function',
    function: {
      name: 'open_url',
      description: 'Open a web page in the user’s default browser. The user is asked to approve first.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Full http(s) URL' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'copy_to_clipboard',
      description: 'Put text on the user’s clipboard so they can paste it (e.g. a rewritten email).',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description: 'Add a reminder to Apple Reminders. The user is asked to approve first.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'What to remind the user about' },
          due: {
            type: 'string',
            description: 'Optional due date/time in ISO 8601 local time, e.g. 2026-10-31T17:00:00'
          }
        },
        required: ['title']
      }
    }
  }
] as const

type Args = Record<string, unknown>

/** Chip text plus a UIcon name (rounded set) for the renderer. */
export function toolLabel(name: string, args: Args): { label: string; icon: string } {
  switch (name) {
    case 'search_web':
      return { icon: 'search', label: `Looking up “${String(args.query ?? '')}”` }
    case 'read_page':
      return { icon: 'book-open-reader', label: `Reading ${hostOf(String(args.url ?? ''))}` }
    case 'open_url':
      return { icon: 'globe', label: `Opening ${hostOf(String(args.url ?? ''))}` }
    case 'copy_to_clipboard':
      return { icon: 'copy-alt', label: 'Copied to your clipboard' }
    case 'create_reminder':
      return { icon: 'alarm-clock', label: `Reminder: “${String(args.title ?? '')}”` }
    default:
      return { icon: 'tools', label: name }
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export async function runTool(name: string, args: Args, ctx: ToolContext): Promise<ToolOutcome> {
  try {
    switch (name) {
      case 'search_web':
        return { result: await searchWeb(String(args.query ?? '')), status: 'done' }

      case 'read_page': {
        const web = webConfig()
        if (!web) return { result: 'Reading pages needs Otty to be connected to DeepSeek.', status: 'error' }
        try {
          return { result: await deepseekFetch(web, String(args.url ?? '')), status: 'done' }
        } catch (err) {
          if (err instanceof WebError) return { result: err.message, status: 'error' }
          throw err
        }
      }

      case 'open_url': {
        const url = String(args.url ?? '')
        if (!/^https?:\/\//i.test(url)) return { result: 'Refused: only http(s) links can be opened.', status: 'error' }
        if (!(await ctx.confirm('Open this link?', url))) return { result: 'The user declined.', status: 'denied' }
        await shell.openExternal(url)
        return { result: `Opened ${url}`, status: 'done' }
      }

      case 'copy_to_clipboard':
        await clipboard.writeText(String(args.text ?? ''))
        return { result: 'Copied.', status: 'done' }

      case 'create_reminder': {
        const title = String(args.title ?? '').trim()
        const due = args.due ? new Date(String(args.due)) : null
        const when = due && !isNaN(+due) ? due : null
        const detail = when ? `${title} — ${when.toLocaleString()}` : title
        if (!(await ctx.confirm('Add this reminder?', detail))) return { result: 'The user declined.', status: 'denied' }
        await createReminder(title, when)
        return { result: `Reminder added: ${detail}`, status: 'done' }
      }

      default:
        return { result: `Unknown tool ${name}`, status: 'error' }
    }
  } catch (err) {
    return { result: `Tool failed: ${(err as Error).message}`, status: 'error' }
  }
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Otty/0.1 (desktop assistant)' },
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** DeepSeek's real search when available; Wikipedia and DuckDuckGo otherwise, or when it fails. */
async function searchWeb(query: string): Promise<string> {
  const web = webConfig()
  if (!web) return lookup(query)
  try {
    return await deepseekSearch(web, query)
  } catch (err) {
    if (!(err instanceof WebError)) throw err
    if (!err.fallback) return err.message
    console.warn('DeepSeek search failed, falling back:', err.message)
    return `${err.message} Here is a simpler lookup instead:\n\n${await lookup(query)}`
  }
}

async function lookup(query: string): Promise<string> {
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

  return parts.length ? parts.join('\n\n') : `No results found for "${query}".`
}

async function createReminder(title: string, due: Date | null): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Reminders are only available on macOS.')
  // Values go through argv, never string-interpolated into the script.
  const script = [
    'on run argv',
    'set t to item 1 of argv',
    'tell application "Reminders"',
    'if (count of argv) > 1 then',
    'set d to current date',
    'set day of d to 1',
    'set year of d to (item 2 of argv as integer)',
    'set month of d to (item 3 of argv as integer)',
    'set day of d to (item 4 of argv as integer)',
    'set hours of d to (item 5 of argv as integer)',
    'set minutes of d to (item 6 of argv as integer)',
    'set seconds of d to 0',
    'make new reminder with properties {name:t, remind me date:d}',
    'else',
    'make new reminder with properties {name:t}',
    'end if',
    'end tell',
    'end run'
  ]
  const argv = due
    ? [title, due.getFullYear(), due.getMonth() + 1, due.getDate(), due.getHours(), due.getMinutes()].map(String)
    : [title]
  await run('osascript', [...script.flatMap((l) => ['-e', l]), '--', ...argv])
}

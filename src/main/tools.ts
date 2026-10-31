import { clipboard, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'

const run = promisify(execFile)

export interface ToolContext {
  /** Ask the user to approve a side-effecting action. */
  confirm(title: string, detail: string): Promise<boolean>
}

export interface ToolOutcome {
  result: string
  status: 'done' | 'denied' | 'error'
}

export const toolDefs = [
  {
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
  },
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

export function toolLabel(name: string, args: Args): string {
  switch (name) {
    case 'search_web':
      return `🔎 Looking up “${String(args.query ?? '')}”`
    case 'open_url':
      return `🌐 Opening ${hostOf(String(args.url ?? ''))}`
    case 'copy_to_clipboard':
      return '📋 Copied to your clipboard'
    case 'create_reminder':
      return `⏰ Reminder: “${String(args.title ?? '')}”`
    default:
      return `🛠️ ${name}`
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

async function searchWeb(query: string): Promise<string> {
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

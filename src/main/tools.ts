import { clipboard, ClipboardItem, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { copyFormats } from './copyFormats'
import { calculate } from './math'
import { ToolPause } from './pause'
import { readPageFromMac } from './pageReader'
import { profileFor, searchesOnServer } from './providers/profiles'
import { getApiKey, getStored } from './settings'
import { deepseekFetch, deepseekSearch, WebError, type WebConfig } from './web'
import { record } from './sent'
import { maskSecrets } from '../shared/secrets'
import { needsCard, needsOnce, SAFETY, type RunTaint, type Safety } from './toolSafety'
import { begin, type UndoKind } from './ledger'
import { send } from './net'

const run = promisify(execFile)

export interface ToolContext {
  /** Ask the user to approve a side-effecting action. */
  confirm(title: string, detail: string): Promise<boolean>
  /** True when this exact address came from the user, a search or a page, not from the model. */
  knownUrl(url: string): boolean
  /**
   * The only tools this work may use, checked first thing in `runTool`, because a model can call a tool it wasn't
   * offered. Always given: a chat turn passes `CHAT_TOOLS`, a job `JOB_TOOLS` (D-42).
   */
  allowed: ReadonlySet<string>
  /** What the run holds so far (D-41). The loop marks `outside` as results come in. */
  taint?: RunTaint
  /** Work that can be resumed: a change it makes is claimed once per call, so a rerun can't repeat it (D-42). */
  runId?: string
  claims?: Claims
  /** How `remember` and `forget` reach the chat. Left out, this work can't touch what Otty knows. */
  learn?: {
    remember(args: Record<string, unknown>): ToolOutcome
    forget(args: Record<string, unknown>): ToolOutcome
  }
  /** Shows a step card under the answer. Only a chat turn can. */
  showSteps?(args: Record<string, unknown>): ToolOutcome
  /** Charts a table the user attached or highlighted in this chat. Only a chat turn has one. */
  makeChart?(args: Record<string, unknown>): ToolOutcome
  /** Asks to start a background job. Only a chat turn can, so a job can never start another. */
  startJob?(args: Record<string, unknown>): Promise<ToolOutcome>
  /** Asks to run a read-only job later. Only a chat turn can, and always with a card. */
  scheduleJob?(args: Record<string, unknown>): Promise<ToolOutcome>
  /** What a change is written down against in the ledger (D-46). Left out, nothing is written. */
  cause?: { chatId?: string; answerId?: string; jobId?: string }
  /** Whose searches and pages these are, for "What left your Mac". */
  sent?: { chatId?: string; group?: string }
}

/** Calls already made by work that can be resumed. `claim` is true only the first time for a run and call. */
export interface Claims {
  claim(runId: string, callId: string): Promise<boolean>
}

/** Where a lookup went. Called just before it goes, so a failed one is still listed: it left either way. */
type Noter = (service: string, host: string) => void

function noter(ctx: ToolContext, kind: 'search' | 'page', what: string): Noter {
  return (service, host) => record({ kind, service, host, local: false, what, ...ctx.sent })
}

export interface ToolOutcome {
  result: string
  status: 'done' | 'denied' | 'error'
  /** Replaces the chip's words once the result is known. `copy` is what tapping the chip copies. */
  chip?: { label: string; copy?: string }
  /** How the change can be taken back: the memory or job it made, and what Undo would say (D-46). */
  undo?: { ref: string; label: string }
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

/** Copies text, with a table as HTML as well so it pastes as a table. True when it held one. */
export async function copyText(source: string): Promise<boolean> {
  const { text, html } = copyFormats(source)
  if (html) await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })])
  else await clipboard.writeText(text)
  return Boolean(html)
}

/** True when nothing should leave the Mac. */
const webOff = () => profileFor(getStored().baseUrl).web === 'off'

/** DeepSeek's key and origin, when the user's provider is DeepSeek; null otherwise. */
function webConfig(): WebConfig | null {
  const { baseUrl } = getStored()
  const key = getApiKey()
  return key && profileFor(baseUrl).web === 'deepseek' ? { baseUrl, key } : null
}

/** The tools offered to the model. Claude brings its own search, and pages are read from the Mac unless DeepSeek does it. */
export function toolDefs(allowed: ReadonlySet<string>) {
  return serviceDefs().filter((d) => allowed.has(d.function.name))
}

function serviceDefs() {
  const local = getStored().learn ? [...otherDefs, makeChartDef, ...learnDefs] : [...otherDefs, makeChartDef]
  if (webOff()) return local
  const { baseUrl, apiFormat, model } = getStored()
  if (webConfig()) return [searchWebDef, readPageDef, ...local, startJobDef, scheduleJobDef]
  if (searchesOnServer(profileFor(baseUrl, apiFormat), model)) return [readPageDef, ...local, startJobDef, scheduleJobDef]
  return [lookupDef, readPageDef, ...local, startJobDef, scheduleJobDef]
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
      description:
        'Put text on the user’s clipboard so they can paste it (e.g. a rewritten email). A Markdown table pastes as a real table in Word, Pages, Excel and Numbers.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The text to copy. For a table, a Markdown table with no code fence.' } },
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
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description:
        'Work out numbers exactly. Plan every number first and send all the steps in one call. Later steps can use names from earlier ones. Handles %, units ("38 degC to degF", "10 km to miles"), sqrt, round, abs, log, trig, min, max, mean, median, std and sum.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'In order, e.g. ["base = 2340 * 17.5%", "tax = base * 8%", "total = base + tax"]'
          }
        },
        required: ['steps']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'show_steps',
      description:
        'Show steps the user carries out on their Mac as a checklist, instead of a numbered list. Use it for 2 or more such steps. Give a step an action whenever one fits: the user presses a button and Otty does it for them.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'What these steps get done' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'One short step' },
                action: {
                  type: 'object',
                  description:
                    '{kind:"paste",text,mode:"replace"|"insert"} pastes into the user’s app. {kind:"open",target} opens a web page, an app by name or a Settings pane (x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture). {kind:"menu",path:["File","Export To","PDF…"]} clicks a menu in their app. {kind:"keys",combo:"⌘⇧4"} presses a shortcut. {kind:"copy",text} copies.'
                }
              },
              required: ['text']
            }
          },
          replaces: { type: 'boolean', description: 'True to update the last card instead of adding one, after the user got stuck' }
        },
        required: ['title', 'steps']
      }
    }
  }
] as const

const makeChartDef = {
  type: 'function',
  function: {
    name: 'make_chart',
    description:
      'Chart the user’s own data: a CSV or TSV they attached, or a table they highlighted. Otty adds up the rows itself and shows the chart; you only say what to chart. It returns the numbers it worked out: use only those in your answer, never your own. Not for made-up or general data (draw that with a mermaid block).',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Which table, by file name, when there is more than one' },
        chart: { type: 'string', enum: ['bar', 'line', 'pie'] },
        x: { type: 'string', description: 'The column the bars, points or slices are, exactly as named in the header' },
        y: { type: 'string', description: 'The column of numbers to add up. Leave it out to count rows.' },
        measure: { type: 'string', enum: ['sum', 'count', 'mean', 'min', 'max'], description: 'How to combine y within each group. Default sum.' },
        by: { type: 'string', enum: ['value', 'day', 'month', 'year'], description: 'When x holds dates, group them by day, month or year. Default value.' },
        title: { type: 'string' },
        top: { type: 'number', description: 'Most bars or slices to show' }
      },
      required: ['chart', 'x']
    }
  }
} as const

const startJobDef = {
  type: 'function',
  function: {
    name: 'start_job',
    description:
      'Look into something big in the background, for questions that need many sources or a long comparison. The user is shown the brief and decides. The job only sees the brief, so put everything it needs in it, and nothing private.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A few words naming what’s being looked into' },
        brief: { type: 'string', description: 'What to find out, in full, standing on its own' }
      },
      required: ['title', 'brief']
    }
  }
} as const

const scheduleJobDef = {
  type: 'function',
  function: {
    name: 'schedule_job',
    description:
      'Look something up later, when the user asks for it at a time ("check this tomorrow at 9", "every Monday at 9"). The user is shown the time and the brief and decides. The job only reads public web pages and leaves a note in Activity. It cannot send or change anything. Like start_job, it only sees the brief.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A few words naming what’s being checked' },
        brief: { type: 'string', description: 'What to find out, in full, standing on its own, with nothing private' },
        at: { type: 'string', description: 'When to look, in ISO 8601 local time, e.g. 2026-11-10T09:00:00. Work it out from the current local time in the user’s message. For a repeat, the first time.' },
        repeat: { type: 'string', enum: ['once', 'daily', 'weekdays', 'weekly'], description: 'Only when the user asks for it again and again ("every Monday"). Weekly repeats on the day of `at`.' }
      },
      required: ['title', 'brief', 'at']
    }
  }
} as const

/** Only offered with "Let Otty learn about me" on. */
const learnDefs = [
  {
    type: 'function',
    function: {
      name: 'remember',
      description:
        'Save something lasting about the user: when they ask you to, or when they reveal something likely to matter in a month. Otty shows them what you saved, with an Undo.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One short plain sentence with no subject, e.g. "Is learning Spanish"' },
          kind: { type: 'string', enum: ['about', 'preference', 'person', 'goal'], description: 'Who they are, how they like answers, someone they mention, or what they’re working towards' },
          confidence: { type: 'number', description: 'From 0 to 1, how sure you are, when you worked it out yourself' },
          replaces: { type: 'number', description: 'The # of a memory this updates' },
          until: { type: 'string', description: 'For short-lived facts: when it stops being true, in ISO 8601' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'forget',
      description: 'Delete a memory when the user says it’s wrong or asks you to forget it. Otty shows them, with an Undo.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number', description: 'The # of the memory' } },
        required: ['id']
      }
    }
  }
] as const

type Args = Record<string, unknown>

/**
 * Chip text plus a UIcon name (rounded set) for the renderer. `show` says when the chip appears: from the start
 * (the default), only once it's done, or never, for a tool that shows itself some other way.
 */
export function toolLabel(name: string, args: Args): { label: string; icon: string; show?: 'running' | 'after' | 'never' } {
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
    case 'calculate':
      // Faster than a frame, so it appears already done.
      return { icon: 'calculator', label: 'Calculated', show: 'after' }
    case 'remember':
    case 'forget':
      return { icon: 'bookmark', label: 'Noted', show: 'never' }
    case 'show_steps':
      return { icon: 'list-check', label: 'Steps', show: 'never' }
    case 'make_chart':
      return { icon: 'chart-histogram', label: 'Worked out the chart', show: 'after' }
    case 'start_job':
      return { icon: 'binoculars', label: `Looking into “${String(args.title ?? 'this')}”` }
    case 'schedule_job':
      return { icon: 'alarm-clock', label: `Checking later: “${String(args.title ?? 'this')}”` }
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

export async function runTool(name: string, args: Args, ctx: ToolContext, callId = ''): Promise<ToolOutcome> {
  if (!ctx.allowed.has(name)) return { result: `The tool ${name} isn't available here.`, status: 'error' }
  // A resumed job reruns its unanswered call, which may already have run before a restart.
  if (ctx.runId && needsOnce(name) && !(await ctx.claims?.claim(ctx.runId, callId))) return { result: 'This was already done once, so it wasn’t done again.', status: 'denied' }
  // D-46: a change is written down before it runs, and marked once it's done.
  const changes = (SAFETY as Record<string, Safety>)[name]?.changes
  if (!changes || changes === 'nothing') return runOne(name, args, ctx)
  const done = begin({ tool: name, ...ctx.cause, summary: toolLabel(name, args).label, undo: UNDO_KIND[name] ?? 'none' })
  const out = await runOne(name, args, ctx)
  done({ status: out.status === 'error' ? 'failed' : out.status, summary: out.result, ...(out.undo ? { ref: out.undo.ref, undoLabel: out.undo.label } : {}) })
  return out
}

/** How the ledger can take a tool's change back. Anything else can't be. */
const UNDO_KIND: Record<string, UndoKind> = { remember: 'memory', forget: 'memory', start_job: 'job', schedule_job: 'job' }

async function runOne(name: string, args: Args, ctx: ToolContext): Promise<ToolOutcome> {
  try {
    switch (name) {
      case 'search_web':
        // A model can call this even when it isn't offered, so "nothing leaves the Mac" is enforced here too.
        if (webOff()) return { result: 'Web lookups are off with this model.', status: 'error' }
        const query = String(args.query ?? '')
        // D-41: once private data and outside words meet, the model's own query is shown before it leaves. The other
        // tools that send words out always ask (open_url, jobs), or only go to addresses Otty already knows (read_page).
        if (needsCard(name, ctx.taint) && !(await ctx.confirm('Look this up?', query))) return { result: 'The user declined.', status: 'denied' }
        return { result: await searchWeb(query, noter(ctx, 'search', query)), status: 'done' }

      case 'read_page': {
        if (webOff()) return { result: 'Web lookups are off with this model.', status: 'error' }
        const web = webConfig()
        const url = String(args.url ?? '')
        if (/^https?:\/\//i.test(url) && !ctx.knownUrl(url) && !(await ctx.confirm('Read this page?', url))) {
          return { result: 'The user declined.', status: 'denied' }
        }
        noter(ctx, 'page', url)(web ? 'DeepSeek' : hostOf(url), web ? hostOf(web.baseUrl) : hostOf(url))
        try {
          // Someone else's page can hold a key too (a leaked config, a paste site), and it shouldn't be passed on.
          return { result: maskSecrets(await (web ? deepseekFetch(web, url) : readPageFromMac(url))).text, status: 'done' }
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
        return {
          result: (await copyText(String(args.text ?? ''))) ? 'Copied as a real table, ready to paste.' : 'Copied.',
          status: 'done'
        }

      case 'create_reminder': {
        const title = String(args.title ?? '').trim()
        const due = args.due ? new Date(String(args.due)) : null
        const when = due && !isNaN(+due) ? due : null
        const detail = when ? `${title} — ${when.toLocaleString()}` : title
        if (!(await ctx.confirm('Add this reminder?', detail))) return { result: 'The user declined.', status: 'denied' }
        await createReminder(title, when)
        return { result: `Reminder added: ${detail}`, status: 'done' }
      }

      case 'calculate': {
        const out = await calculate(args.steps)
        return { result: out.result, status: out.ok ? 'done' : 'error', ...(out.label ? { chip: { label: out.label, copy: out.value } } : {}) }
      }

      case 'remember':
      case 'forget':
        if (!ctx.learn) return { result: 'Otty isn’t learning here. Don’t say this was saved.', status: 'denied' }
        return ctx.learn[name](args)

      case 'show_steps':
        return ctx.showSteps ? ctx.showSteps(args) : { result: 'Steps can’t be shown here.', status: 'error' }

      case 'make_chart':
        return ctx.makeChart ? ctx.makeChart(args) : { result: 'There’s no data to chart here.', status: 'error' }

      case 'start_job':
        if (webOff()) return { result: 'Background work needs the web, which is off with this model.', status: 'error' }
        return ctx.startJob ? await ctx.startJob(args) : { result: 'That isn’t available here.', status: 'error' }

      case 'schedule_job':
        if (webOff()) return { result: 'Background work needs the web, which is off with this model.', status: 'error' }
        return ctx.scheduleJob ? await ctx.scheduleJob(args) : { result: 'That isn’t available here.', status: 'error' }

      default:
        return { result: `Unknown tool ${name}`, status: 'error' }
    }
  } catch (err) {
    if (err instanceof ToolPause) throw err
    return { result: `Tool failed: ${(err as Error).message}`, status: 'error' }
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

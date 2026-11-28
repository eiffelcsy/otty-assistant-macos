import type { LogControl, SentItem, SentKind } from '../../shared/types'
import { repeatWords } from '../../shared/repeat'
import { describeWhen } from '../../shared/when'
import type { Job } from '../jobs/types'
import type { ActionRow } from '../ledger'

// Every word the Logbook shows (D-63, Spec 04), in one place in main: one verb first, past tense for what happened
// and present for what's waiting, and times only from `describeWhen` and one locale (UX_REVIEW #12).

const DAY = 86_400_000
const midnight = (t: number) => new Date(t).setHours(0, 0, 0, 0)
const daysFrom = (at: number, now: number) => Math.round((midnight(at) - midnight(now)) / DAY)

export const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export const clock = (at: number): string => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** "3:44", without AM or PM, for the ledger's 44 px time column (Spec 04); sentences keep `clock`. */
export const shortClock = (at: number): string =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    .formatToParts(at)
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim()

/** "Today", "Yesterday", "Tomorrow", "Monday" within a week, then "Tue 11 Nov". */
export function dayTitle(at: number, now: number): string {
  const days = daysFrom(at, now)
  if (days === 0) return 'Today'
  if (days === -1) return 'Yesterday'
  if (days === 1) return 'Tomorrow'
  if (Math.abs(days) < 7) return new Date(at).toLocaleDateString(undefined, { weekday: 'long' })
  return new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** The local day, as "2026-11-19", which also sorts. */
export const dayKey = (at: number): string => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Coming up's time column: "in 2 h", "Thu", "daily". */
export function soonTime(job: Job, now: number): string {
  if (job.repeat) return job.repeat.every === 'week' ? 'weekly' : 'daily'
  const due = job.dueAt ?? now
  const hours = Math.round((due - now) / 3_600_000)
  if (due - now < 60 * 60_000) return `in ${Math.max(1, Math.round((due - now) / 60_000))} min`
  if (hours < 12) return `in ${hours} h`
  return daysFrom(due, now) === 0 ? clock(due) : new Date(due).toLocaleDateString(undefined, { weekday: 'short' })
}

// What left the Mac (D-31): moved here from the renderer's SentList.

export const SENT_GLYPHS: Record<SentKind, string> = {
  question: 'comment',
  job: 'lookup',
  title: 'edit',
  explain: 'book-open-reader',
  check: 'plug-connection',
  search: 'search',
  page: 'globe',
  connection: 'plug-connection'
}

/** "Asked DeepSeek: Budget.xlsx · 3 keys hidden", and the part to show in bold. */
export function sentLine(item: SentItem): { first: string; strong?: string } {
  const what = item.what ? `: ${item.what}` : ''
  // D-54: checked before `local`, since Apple's reads are on this Mac and still went to the connection.
  if (item.kind === 'connection') return { first: `${item.what || 'Read something'} from ${item.service}`, strong: item.what || undefined }
  if (item.local) return { first: item.kind === 'question' ? `Asked the model on this Mac${what}` : `Used the model on this Mac${what}` }
  const to = item.service
  switch (item.kind) {
    case 'question':
      return { first: `Asked ${to}${what}` }
    case 'job':
      return { first: `Looked into something with ${to}${what}` }
    case 'title':
      return { first: `Asked ${to} for a chat title` }
    case 'explain':
      return { first: `Asked ${to} to explain “${item.what}”`, strong: item.what }
    case 'check':
      return { first: `Checked the connection to ${to}` }
    case 'search':
      return item.what ? { first: `Searched ${to} for “${item.what}”`, strong: item.what } : { first: `${to} searched the web` }
    case 'page':
      return item.service === item.host
        ? { first: `Read ${item.what || item.host}`, strong: item.what || item.host }
        : { first: `Read ${item.what || 'a page'} through ${to}`, strong: item.what || undefined }
  }
}

/** Where it went, and what it was part of: "DeepSeek search · Train times to Sendai". */
export function sentWhere(item: SentItem, partOf?: string): string {
  const parts: string[] = []
  if (item.local) parts.push('nothing left your Mac')
  else parts.push(item.kind === 'search' ? `${item.service} search` : item.host && item.host !== item.service ? item.host : item.service)
  if (item.count > 1) parts.push(item.kind === 'job' ? `${item.count} requests` : `${item.count} rounds`)
  if (partOf) parts.push(partOf)
  return parts.join(' · ')
}

/** Why something was sent, in one sentence. */
export function sentWhy(item: SentItem, job?: Job, chat?: string): string {
  if (job) return `Your look-up “${job.title}” needed it.`
  switch (item.kind) {
    case 'question':
      return chat ? `You asked a question in “${chat}”.` : 'You asked a question.'
    case 'search':
    case 'page':
      return chat ? `Otty looked this up while answering in “${chat}”.` : 'Otty looked this up while answering you.'
    case 'explain':
      return `You asked what “${item.what}” means.`
    case 'title':
      return 'Otty named a chat, so you can find it later.'
    case 'check':
      return 'You checked the connection in Settings.'
    case 'job':
      return 'A look-up needed it.'
    case 'connection':
      return 'Otty checked one of your connections to answer you.'
  }
}

// What Otty changed and noted (D-46).

const MEMORY_TOOLS = new Set(['remember', 'forget'])
export const isNote = (r: ActionRow): boolean => MEMORY_TOOLS.has(r.tool)

export function changeGlyph(r: ActionRow): string {
  if (isNote(r)) return 'notebook'
  if (r.tool === 'create_reminder') return 'alarm-clock'
  if (r.tool === 'start_job' || r.tool === 'schedule_job') return 'lookup'
  if (r.tool === 'copy_to_clipboard') return 'copy-alt'
  if (r.tool === 'open_url') return 'globe'
  return r.tool.startsWith('step:') ? 'list-check' : 'check-circle'
}

/** What happened to it, after where it was: "can't be undone", "you said no". */
export function changeState(r: ActionRow): string {
  if (r.status === 'failed') return 'didn’t work'
  if (r.status === 'denied') return 'you said no'
  if (r.status === 'running') return 'didn’t finish'
  if (r.undoneAt) return 'undone'
  return r.undo === 'none' || !r.ref ? 'can’t be undone' : ''
}

export function changeWhy(r: ActionRow, chat?: string): string {
  const where = chat ? ` in “${chat}”` : ''
  if (isNote(r)) return `Otty kept this from what you said${where}. It never keeps what only a page or a file said.`
  if (r.tool.startsWith('step:')) return `You pressed a step’s button${where}.`
  return `You said yes on a card${where}.`
}

export const UNDO: LogControl = { kind: 'undo', label: 'Undo' }

// Look-ups and checks (D-22, D-27, D-34).

export function jobFirst(job: Job, held: boolean): { first: string; strong: string; tone?: 'wait' | 'fail' } {
  const t = job.title
  if (held && (job.status === 'working' || job.status === 'queued')) return { first: `Paused: “${t}”`, strong: t }
  switch (job.status) {
    case 'scheduled':
      return job.repeat ? { first: `Checks “${t}”`, strong: t } : { first: `Will look into “${t}”`, strong: t }
    case 'queued':
      return { first: `Waiting its turn: “${t}”`, strong: t }
    case 'working':
      return { first: `Looking into “${t}”`, strong: t }
    case 'waiting': {
      const host = hostIn(job.waitUrl)
      return { first: `Waiting: read ${host}?`, strong: host, tone: 'wait' }
    }
    case 'paused':
      return { first: `Waiting for you: “${t}”`, strong: t, tone: 'wait' }
    case 'done':
      return { first: `Looked into “${t}”`, strong: t }
    case 'failed':
      return { first: `Couldn’t finish “${t}”`, strong: t, tone: 'fail' }
  }
}

export function jobSecond(job: Job, now: number): string {
  if (job.status === 'scheduled' && job.dueAt) return job.repeat ? `${capital(repeatWords(job.repeat, job.dueAt))} · next ${describeWhen(job.dueAt, now)}` : capital(describeWhen(job.dueAt, now))
  if (job.status === 'waiting') return `Part of “${job.title}”`
  if (job.error) return job.error
  const pages = job.lookups ? plural(job.lookups, 'page') + ' read' : 'Nothing read yet'
  if (job.status === 'done') {
    const late = job.ranLate && job.dueAt ? ` · a little late, it was due ${describeWhen(job.dueAt, job.updatedAt)}` : ''
    return `${pages}${job.partial ? ' · only part of the answer' : ''}${late}`
  }
  return pages
}

export function jobWhy(job: Job, chat: string | undefined, now: number): string {
  if (job.status === 'waiting') return `Your look-up “${job.title}” found this page and needs your OK to read it.`
  if (job.status === 'paused' && job.error) return job.error
  if (job.seriesId || job.repeat) return 'A regular check you set up on a card. It reads public pages and changes nothing.'
  if (job.dueAt && job.status === 'scheduled') return `You asked for this on a card${chat ? ` in “${chat}”` : ''}. It looks ${describeWhen(job.dueAt, now)}.`
  return `You asked for this on a card${chat ? ` in “${chat}”` : ''}. It reads public pages and changes nothing.`
}

/** The buttons a look-up's state allows, the primary one being what the state calls for. */
export function jobControls(job: Job, held: boolean, overCap: boolean): LogControl[] {
  const out: LogControl[] = []
  const live = job.status === 'scheduled' || job.status === 'queued' || job.status === 'working' || job.status === 'waiting' || job.status === 'paused'
  if (job.status === 'waiting') out.push({ kind: 'allow', label: 'Allow', primary: true }, { kind: 'deny', label: 'Don’t allow' })
  if (held && (job.status === 'working' || job.status === 'queued')) out.push({ kind: 'carry-on', label: 'Carry on', primary: true })
  else if (job.status === 'paused') out.push({ kind: 'resume', label: overCap ? 'Run it anyway' : 'Keep going', primary: true })
  if (job.status === 'failed') out.push({ kind: 'retry', label: 'Try again', primary: true })
  if (job.resultThread) out.push({ kind: 'open', label: 'Open the report' })
  if (live) out.push({ kind: 'stop', label: job.repeat ? 'Stop repeating' : job.status === 'scheduled' ? 'Cancel' : 'Stop' })
  return out
}

/** The one action a look-up's line carries, if any. */
export function jobAction(job: Job, held: boolean): LogControl | undefined {
  if (job.status === 'waiting' || job.status === 'paused') return { kind: 'decide', label: 'Decide' }
  if (held && (job.status === 'working' || job.status === 'queued')) return undefined
  if (job.status === 'scheduled') return { kind: 'stop', label: job.repeat ? 'Stop' : 'Cancel' }
  return undefined
}

function hostIn(url?: string): string {
  try {
    return url ? new URL(url).host : 'a page'
  } catch {
    return 'a page'
  }
}

export const VIEW_NAMES: Record<string, { name: string; description?: string; empty: string }> = {
  wait: { name: 'Needs you', empty: 'Nothing needs you.' },
  next: { name: 'Coming up', empty: 'Nothing planned. Try “check this page again tomorrow at 9”.' },
  all: { name: 'Everything', empty: 'When Otty looks into something, sends something or changes something, it’s written down here.' },
  sent: {
    name: 'What left my Mac',
    description: 'Questions, searches, pages',
    empty: 'Nothing has left your Mac yet. When Otty asks your AI service, searches or reads a page, it’s listed here: where it went, and why.'
  },
  changed: {
    name: 'What Otty changed',
    description: 'Reminders, looks, steps',
    empty: 'Otty hasn’t changed anything yet. When it adds a reminder or presses a button for you, it’s listed here, with whether it can be undone.'
  },
  noted: { name: 'What Otty noted', description: 'Learned, updated, forgot', empty: 'Otty hasn’t noted anything yet.' }
}

export function pausedLine(until: number | null, now: number): string {
  return until ? `Otty is paused until ${describeWhen(until, now)}. Nothing runs on its own.` : 'Otty is paused. Nothing runs on its own until you let it carry on.'
}

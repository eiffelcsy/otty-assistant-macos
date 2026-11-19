import type { LogDay, LogDetails, LogEntry, LogNow, LogPage, LogView, SentItem } from '../../shared/types'
import { findRanges, parseQuery } from '../../shared/match'
import { describeWhen } from '../../shared/when'
import type { Job } from '../jobs/types'
import { canUndo, type ActionRow } from '../ledger'
import * as w from './words'

// The Logbook (D-63, Spec 04): one read-only look at what Otty has been doing, merged from the job store, what left
// the Mac (D-31) and the action ledger (D-46). It changes nothing: every button sends an id back through the same
// channels the chat uses. Pure, so it's tested without a Mac or a database.

export interface LogSources {
  now: number
  jobs: Job[]
  /** Everything is paused (D-39), and until when. */
  held: boolean
  pausedUntil: number | null
  /** This month's limit has been reached (D-33). */
  overCap: boolean
  sent: SentItem[]
  changes: ActionRow[]
  /** Chat titles by id, for "part of". */
  chats: ReadonlyMap<string, string>
  /** Confirm cards waiting in chats right now. */
  cards: { threadId: string; heading: string }[]
}

/** How many pages a look-up usually reads, from the last few that finished, for "Page 3 of about 6". */
export function typicalPages(jobs: Job[]): number {
  const done = jobs.filter((j) => j.status === 'done' && j.lookups > 0).slice(-10)
  if (!done.length) return 6
  return Math.max(2, Math.round(done.reduce((n, j) => n + j.lookups, 0) / done.length))
}

const isRunning = (j: Job) => j.status === 'working'
/** Waiting for an answer, or failed and not yet seen (or within the last day, so opening the Logbook doesn't hide it). */
const needsYou = (j: Job, s: LogSources) => j.status === 'waiting' || (j.status === 'paused' && !s.held) || (j.status === 'failed' && (!j.seenAt || s.now - j.updatedAt < 86_400_000))

function jobEntry(j: Job, s: LogSources, soon = false): LogEntry {
  const { first, strong, tone } = w.jobFirst(j, s.held)
  const second = w.jobSecond(j, s.now)
  const at = j.status === 'scheduled' ? (soon ? (j.dueAt ?? j.createdAt) : j.createdAt) : j.updatedAt
  const time = soon ? w.soonTime(j, s.now) : w.shortClock(at)
  const action = w.jobAction(j, s.held)
  return { id: `job:${j.id}`, at, time, glyph: j.repeat ? 'arrows-repeat' : tone === 'wait' ? 'hourglass-end' : tone === 'fail' ? 'exclamation' : 'binoculars', ...(tone ? { tone } : {}), first, strong, second, ...(action ? { action } : {}), label: `${time}, ${first}, ${second}` }
}

function sentEntry(item: SentItem, s: LogSources): LogEntry {
  const { first, strong } = w.sentLine(item)
  const job = item.group ? s.jobs.find((j) => j.id === item.group) : undefined
  const partOf = job?.title ?? (item.chatId ? s.chats.get(item.chatId) : undefined)
  const second = w.sentWhere(item, partOf)
  const time = w.shortClock(item.at)
  return { id: `sent:${item.id}`, at: item.at, time, glyph: item.local ? 'laptop' : w.SENT_GLYPHS[item.kind], first, ...(strong ? { strong } : {}), second, label: `${time}, ${first}, ${second}` }
}

function changeEntry(r: ActionRow, s: LogSources): LogEntry {
  const chat = r.chatId ? s.chats.get(r.chatId) : undefined
  const second = [w.changeState(r), chat].filter(Boolean).join(' · ') || 'Done'
  const time = w.shortClock(r.at)
  return {
    id: `act:${r.id}`,
    at: r.at,
    time,
    glyph: w.changeGlyph(r),
    ...(r.status === 'failed' ? { tone: 'fail' as const } : {}),
    first: r.summary,
    second: w.capital(second),
    ...(canUndo(r) ? { action: w.UNDO } : {}),
    ...(r.undoneAt ? { undone: true } : {}),
    label: `${time}, ${r.summary}, ${second}`
  }
}

function cardEntry(c: LogSources['cards'][number], s: LogSources): LogEntry {
  const chat = s.chats.get(c.threadId) ?? 'a chat'
  return {
    id: `card:${c.threadId}`,
    at: s.now,
    time: 'now',
    glyph: 'hourglass-end',
    tone: 'wait',
    first: `Waiting: ${c.heading}`,
    second: `In “${chat}”`,
    action: { kind: 'decide', label: 'Decide' },
    label: `Now, waiting: ${c.heading}, in ${chat}`
  }
}

/** Every entry a view holds, newest first (Coming up: soonest first). */
function entries(view: LogView, s: LogSources): LogEntry[] {
  const notes = s.changes.filter(w.isNote)
  const changed = s.changes.filter((r) => !w.isNote(r))
  const byTime = (list: LogEntry[]) => list.sort((a, b) => b.at - a.at)
  switch (view) {
    case 'wait':
      return byTime([...s.cards.map((c) => cardEntry(c, s)), ...s.jobs.filter((j) => needsYou(j, s)).map((j) => jobEntry(j, s))])
    case 'next':
      return s.jobs
        .filter((j) => j.status === 'scheduled')
        .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
        .map((j) => jobEntry(j, s, true))
    case 'all':
      return byTime([
        ...s.cards.map((c) => cardEntry(c, s)),
        ...s.jobs.filter((j) => !isRunning(j)).map((j) => jobEntry(j, s)),
        ...s.sent.map((i) => sentEntry(i, s)),
        ...s.changes.map((r) => changeEntry(r, s))
      ])
    case 'sent':
      return byTime(s.sent.map((i) => sentEntry(i, s)))
    case 'changed':
      return byTime(changed.map((r) => changeEntry(r, s)))
    case 'noted':
      return byTime(notes.map((r) => changeEntry(r, s)))
  }
}

/** Words too common to search on: "did my CV leave my Mac?" searches for "CV". */
const COMMON = new Set(['a', 'an', 'the', 'did', 'does', 'do', 'my', 'me', 'i', 'it', 'is', 'was', 'what', 'when', 'where', 'which', 'who', 'leave', 'left', 'mac', 'otty', 'to', 'of', 'for', 'in', 'on', 'and', 'or', 'any', 'ever', 'has', 'have', '?'])

export function searchTerms(q: string): string[] {
  const all = parseQuery(q).map((t) => t.replace(/[?!.,]+$/, '')).filter(Boolean)
  const content = all.filter((t) => !COMMON.has(t))
  return content.length ? content : all
}

const matches = (e: LogEntry, terms: string[]) => terms.every((t) => findRanges(`${e.first} ${e.second}`, [t]).length > 0)

function group(list: LogEntry[], view: LogView, s: LogSources, fold: boolean): LogDay[] {
  const days: LogDay[] = []
  for (const e of list) {
    const date = w.dayKey(e.at)
    const last = days.at(-1)
    if (last?.date === date) last.entries.push(e)
    else days.push({ date, title: w.dayTitle(e.at, s.now), count: '', entries: [e] })
  }
  const older = w.dayKey(s.now - 2 * 86_400_000)
  for (const d of days) {
    d.count = w.plural(d.entries.length, 'entry', 'entries')
    if (fold && view === 'all' && d.date <= older) d.folded = true
  }
  return days
}

function now(s: LogSources): LogNow[] {
  const expected = typicalPages(s.jobs)
  return s.jobs.filter(isRunning).map((j) => {
    const total = Math.max(expected, j.lookups + 1)
    return {
      id: j.id,
      title: j.title,
      // A note from the runner ("Lost the connection. Trying again…") says more than the page count while it lasts.
      line: s.held ? 'Paused' : (j.error ?? `Page ${Math.min(j.lookups + 1, total)} of about ${total}`),
      done: j.lookups,
      expected: total,
      paused: s.held,
      ...(j.note ? { note: j.note } : {})
    }
  })
}

export function logbook(s: LogSources, view: LogView = 'all', search = ''): LogPage {
  const terms = search.trim() ? searchTerms(search) : []
  const list = entries(view, s)
  const shown = terms.length ? list.filter((e) => matches(e, terms)) : list
  const name = w.VIEW_NAMES[view]
  const views = (['wait', 'next', 'all', 'sent', 'changed', 'noted'] as const).map((v) => ({
    view: v,
    name: w.VIEW_NAMES[v].name,
    count: entries(v, s).length,
    ...(w.VIEW_NAMES[v].description ? { description: w.VIEW_NAMES[v].description } : {})
  }))
  return {
    view,
    title: terms.length ? `“${search.trim()}”` : name.name,
    subtitle: terms.length ? w.plural(shown.length, 'entry', 'entries') : view === 'next' ? w.plural(shown.length, 'check') : view === 'wait' ? '' : 'this week',
    views,
    now: now(s),
    days: group(shown, view, s, !terms.length),
    empty: terms.length ? `Nothing in the Logbook mentions “${search.trim()}”.` : name.empty,
    ...(s.held ? { paused: w.pausedLine(s.pausedUntil, s.now) } : {})
  }
}

/** One entry, opened: why it happened, what it sent and changed, what it was part of, and what can be done. */
export function entryDetails(s: LogSources, id: string): LogDetails | null {
  const [kind, ref] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]
  if (kind === 'job') {
    const j = s.jobs.find((x) => x.id === ref)
    if (!j) return null
    const chat = j.sourceThread ? s.chats.get(j.sourceThread) : undefined
    const sent = s.sent.filter((i) => i.group === j.id).map((i) => `${w.sentLine(i).first} · ${w.clock(i.at)}`)
    return {
      id,
      title: w.jobFirst(j, s.held).first,
      time: w.capital(describeWhen(j.status === 'scheduled' && j.dueAt ? j.dueAt : j.updatedAt, s.now)),
      why: w.jobWhy(j, chat, s.now),
      sent,
      changes: [],
      ...(j.sourceThread && chat ? { partOf: { label: chat, chatId: j.sourceThread } } : {}),
      controls: w.jobControls(j, s.held, s.overCap),
      ...(j.status === 'waiting' && j.waitUrl ? { waitUrl: j.waitUrl } : {})
    }
  }
  if (kind === 'sent') {
    const item = s.sent.find((i) => String(i.id) === ref)
    if (!item) return null
    const job = item.group ? s.jobs.find((j) => j.id === item.group) : undefined
    const chat = item.chatId ? s.chats.get(item.chatId) : undefined
    return {
      id,
      title: w.sentLine(item).first,
      time: w.capital(describeWhen(item.at, s.now)),
      why: w.sentWhy(item, job, chat),
      sent: [w.sentWhere(item)],
      changes: [],
      ...(item.chatId && chat ? { partOf: { label: chat, chatId: item.chatId } } : {}),
      controls: []
    }
  }
  if (kind === 'act') {
    const r = s.changes.find((x) => String(x.id) === ref)
    if (!r) return null
    const chat = r.chatId ? s.chats.get(r.chatId) : undefined
    return {
      id,
      title: r.summary,
      time: w.capital(describeWhen(r.at, s.now)),
      why: w.changeWhy(r, chat),
      sent: [],
      changes: [{ line: r.summary, note: w.capital(w.changeState(r) || (r.undoLabel ?? 'Done')), ...(canUndo(r) ? { action: w.UNDO } : {}) }],
      ...(r.chatId && chat ? { partOf: { label: chat, chatId: r.chatId } } : {}),
      controls: []
    }
  }
  if (kind === 'card') {
    const c = s.cards.find((x) => x.threadId === ref)
    if (!c) return null
    const chat = s.chats.get(c.threadId) ?? 'a chat'
    return { id, title: c.heading, time: 'Now', why: `Otty asked this in “${chat}” and is waiting for your answer there.`, sent: [], changes: [], partOf: { label: chat, chatId: c.threadId }, controls: [{ kind: 'open', label: 'Go to the card', primary: true }] }
  }
  return null
}

import { app, screen, shell } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import type { ActivityItem, Capture } from '../shared/types'
import * as settings from './settings'
import { macSettings } from './settingsOnMac'
import { captureWholeScreen, withWindowsHidden } from './capture'
import { chatStore, database, pruneOldChats } from './store'
import { ChatSession } from './llm'
import { loadMath } from './math'
import { memoryStore } from './memory'
import { createRunner, jobCost } from './jobs'
import { setUsageSink, UsageMeter } from './usage'
import { MemorySentLog, setSentLog, SqliteSentLog } from './sent'
import { setLocalOnly } from './net'
import { activeProfile } from './providers'
import { MemoryLedger, setLedger, SqliteLedger } from './ledger'
import { forgetHidden } from './hiddenLines'
import { MemoryPebbles, SqlitePebbles } from './pebbles'
import { eventStore } from './calendar/hub'
import { calendarRange } from './calendar/range'
import { setOttyCalendar } from './connections/tools'
import { capStatus } from '../shared/cap'
import { retentionCutoff } from './store/retention'
import { forward, tellActivity, tellLogbook, tellSettings } from './notify'
import type { LogSources } from './logbook'
import type { HomeSources } from './home'
import type { CalendarItem } from '../shared/types'
import { serviceAt, serviceById } from '../shared/services'
import { shownWindows } from './windows'
import { refreshAll } from './connections'
import { setCalendarHelper } from './connections/apple'
import { setOpener } from './connections/oauth'

// D-45: the chat, the jobs and the stores around them, made once. Windows, menus and IPC reach them from here.

/** First, before anything reads a setting: the file, the Keychain and the login item are the Mac's. */
settings.setSettingsBackend(macSettings)

/** Opened at launch, once the database is. Null until then, so nothing waits on it. */
let meter: UsageMeter | null = null

export const usageMeter = (): UsageMeter | null => meter

/** This month against the limit, or null with no limit (or no meter yet). */
export function cap() {
  const month = meter?.month()
  return month ? capStatus(settings.getStored().monthlyCap, month) : null
}

/** The limit, when this month has reached it: then Otty asks before starting anything by itself (D-33). */
function overCap() {
  const c = cap()
  return c?.over ? { unit: c.unit, limit: c.limit } : null
}

/** What left the Mac (D-31). With "Remember my chats" off, kept only while Otty runs, like the chats themselves. */
let savedSent: SqliteSentLog | null = null
const unsavedSent = new MemorySentLog()
export function sentLog() {
  if (!settings.getStored().rememberChats) return unsavedSent
  try {
    return (savedSent ??= new SqliteSentLog(database()))
  } catch (err) {
    console.error('Could not open what left the Mac', err)
    return unsavedSent
  }
}
setSentLog(sentLog, () => logged())

/** D-52: with a model on this Mac, the one door out refuses everything else. */
setLocalOnly(() => activeProfile().web === 'off')

/** What Otty changed (D-46), kept like what left the Mac. */
let savedLedger: SqliteLedger | null = null
const unsavedLedger = new MemoryLedger()
export function ledger() {
  if (!settings.getStored().rememberChats) return unsavedLedger
  try {
    return (savedLedger ??= new SqliteLedger(database()))
  } catch (err) {
    console.error('Could not open what Otty changed', err)
    return unsavedLedger
  }
}
setLedger(ledger, () => logged())

/** Kept Pebbles, kept like the chats they came from. */
let savedPebbles: SqlitePebbles | null = null
const unsavedPebbles = new MemoryPebbles()
export function pebbles() {
  if (!settings.getStored().rememberChats) return unsavedPebbles
  try {
    return (savedPebbles ??= new SqlitePebbles(database()))
  } catch (err) {
    console.error('Could not open kept Pebbles', err)
    return unsavedPebbles
  }
}

/** Keep or put back a Pebble from an answer in the chat on show. Main looks it up, so a window keeps only what's there. */
export function keepPebble(answerId: string, index: number, keep: boolean): boolean {
  const found = chat.pebbleAt(answerId, index)
  if (!found) return false
  if (keep) pebbles().keep({ ...found.pebble, chatId: found.chatId, answerId, index, kept: Date.now() })
  else pebbles().drop(answerId, index)
  return true
}

// D-73: Otty's own calendar, kept whatever "Remember my chats" says. Plugged in for the connections' reads and the chat.
export { eventStore }
setOttyCalendar(eventStore)

/** Today's events from every calendar, for Home's Today. A failed read gives none, and the rest of Home still shows. */
async function todaysEvents(now: number): Promise<CalendarItem[]> {
  const d = new Date(now)
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  try {
    return (await calendarRange(eventStore(), from, to)).items
  } catch {
    return []
  }
}

/** What Home reads (D-66): the Logbook's sources, and what Home's sentences need besides. */
export async function homeSources(): Promise<HomeSources> {
  const base = await logbookSources()
  const s = settings.getStored()
  return {
    ...base,
    events: await todaysEvents(base.now),
    remembered: s.rememberChats,
    webOff: activeProfile().web === 'off',
    service: serviceById(serviceAt(s.baseUrl)).label,
    asked: base.chats.size > 0 || base.sent.some((i) => i.kind === 'question')
  }
}

/** A sent-log or ledger row was written: the Logbook hears once a second at most, never by polling (D-63). */
let loggedTimer: ReturnType<typeof setTimeout> | null = null
function logged(): void {
  loggedTimer ??= setTimeout(() => {
    loggedTimer = null
    tellLogbook()
  }, 1_000)
}

/** Background work and answers in other chats. */
export async function activity(): Promise<ActivityItem[]> {
  const answers = chat
    .running()
    .filter((t) => !t.shown)
    .map((t): ActivityItem => ({ id: t.threadId, kind: 'answer', title: t.title, state: 'working', pages: 0, chatId: t.threadId, unseen: false }))
  return [...answers, ...(await jobs.list())]
}

/** What the Logbook reads (D-63): everything worded in main, nothing sent to a window but the words. */
export async function logbookSources(): Promise<LogSources> {
  const { workPaused, workPausedUntil } = settings.getStored()
  const chats = new Map((await chatStore().list({ limit: 500 }).catch(() => [])).map((c) => [c.id, c.title]))
  for (const t of chat.running()) chats.set(t.threadId, t.title)
  return {
    now: Date.now(),
    jobs: await jobs.all(),
    held: workPaused,
    pausedUntil: workPausedUntil ?? null,
    overCap: overCap() !== null,
    sent: sentLog().list(),
    changes: ledger().list(),
    chats,
    cards: chat.asking()
  }
}

/** Something Otty is doing changed. `news` means there's something for the user to see. */
export async function activityChanged(news: boolean): Promise<void> {
  tellActivity(await activity(), news)
}

export const chat = new ChatSession(forward, {
  onTurn: (unseen) => void activityChanged(unseen),
  startJob: (job) => (job.dueAt ? jobs.schedule({ ...job, dueAt: job.dueAt }) : jobs.start(job)),
  jobCost: () => jobCost(jobs, () => meter?.summary() ?? null),
  overCap: () => overCap() !== null,
  jobLive: (id) => jobs.isLive(id),
  withdrawJob: (id) => jobs.withdraw(id),
  onHomeUsed: () => {
    settings.update({ homeUsed: true })
    tellSettings(settings.getPublic())
  }
})
export const jobs = createRunner((news) => void activityChanged(news), overCap)

export function resetChat(): void {
  chat.reset()
  forward({ type: 'reset' })
}

/** "Forget all chats", or turning off "Remember my chats": the open one goes too, even mid-answer. */
export async function forgetAllChats(): Promise<void> {
  for (const { threadId } of chat.running()) chat.forget(threadId)
  chat.forget(chat.threadId)
  forward({ type: 'reset' })
  await jobs.forgetAll()
  await chatStore().clear()
  sentLog().clear()
  unsavedSent.clear()
  ledger().clear()
  unsavedLedger.clear()
  pebbles().clear()
  unsavedPebbles.clear()
  forgetHidden()
}

/** One chat deleted: its jobs, its rows in what left the Mac, and the chat itself. */
export async function deleteChat(id: string): Promise<void> {
  const open = chat.threadId === id
  chat.forget(id)
  await jobs.forgetChat(id)
  await chatStore().delete(id)
  sentLog().forgetChat(id)
  ledger().forgetChat(id)
  pebbles().forgetChat(id)
  if (open) forward({ type: 'reset' })
}

/** The otter's snip of what's on screen, for "I'm stuck". Without Screen Recording, the words go alone. */
export async function stuckOnStep(answerId: string, index: number, check = false): Promise<void> {
  const question = check ? chat.checkQuestion(answerId, index) : chat.stuckQuestion(answerId, index)
  if (!question) return
  if (check) chat.tickStep(answerId, index, true)
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { context } = await withWindowsHidden(shownWindows(), () => captureWholeScreen(display))
  const captures: Capture[] = context ? [{ id: randomUUID(), context, app: null }] : []
  void chat.send(question, captures, null)
}

// D-54: the connections layer reaches the Mac only through these plug-ins.
setCalendarHelper(() => (app.isPackaged ? join(process.resourcesPath, 'otty-calendar') : join(app.getAppPath(), 'build/bin/otty-calendar')))
setOpener((url) => shell.openExternal(url))

/** Chats past the "Keep chats" setting, and the finished jobs from the same time. */
export async function tidyOldChats(): Promise<void> {
  await pruneOldChats()
  const cutoff = retentionCutoff(settings.getStored().keepChats)
  if (cutoff !== null) {
    await jobs.prune(cutoff)
    sentLog().prune(cutoff)
    ledger().prune(cutoff)
    pebbles().prune(cutoff)
  }
}

/** Opens the database (and imports any chats.json) off the first click's path, then tidies and carries on. */
export function startServices(): void {
  chatStore()
  try {
    meter = new UsageMeter(database())
    setUsageSink(meter)
  } catch (err) {
    console.error('Could not open the usage meter', err)
  }
  memoryStore().pruneExpired()
  void loadMath()
  void tidyOldChats().catch((err) => console.error('Could not tidy old jobs', err))
  void jobs.launch().catch((err) => console.error('Could not resume background work', err))
  // D-54: connections of the user's own are checked again at launch.
  void refreshAll().catch((err) => console.error('Could not check connections', err))
}

import { screen } from 'electron'
import { randomUUID } from 'crypto'
import type { ActivityItem, Capture } from '../shared/types'
import * as settings from './settings'
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
import { capStatus } from '../shared/cap'
import { retentionCutoff } from './store/retention'
import { forward, tellActivity } from './notify'
import { shownWindows } from './windows'

// D-45: the chat, the jobs and the stores around them, made once. Windows, menus and IPC reach them from here.

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
setSentLog(sentLog)

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
setLedger(ledger)

/** Background work and answers in other chats. */
export async function activity(): Promise<ActivityItem[]> {
  const answers = chat
    .running()
    .filter((t) => !t.shown)
    .map((t): ActivityItem => ({ id: t.threadId, kind: 'answer', title: t.title, state: 'working', pages: 0, chatId: t.threadId, unseen: false }))
  return [...answers, ...(await jobs.list())]
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
  withdrawJob: (id) => jobs.withdraw(id)
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

/** Chats past the "Keep chats" setting, and the finished jobs from the same time. */
export async function tidyOldChats(): Promise<void> {
  await pruneOldChats()
  const cutoff = retentionCutoff(settings.getStored().keepChats)
  if (cutoff !== null) {
    await jobs.prune(cutoff)
    sentLog().prune(cutoff)
    ledger().prune(cutoff)
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
}

import { LANGUAGE_SHORT } from '../../shared/languages'
import type { AnswerLanguage, Memory, MemoryKind, QuickAction } from '../../shared/types'
import type { MemoryStore } from './store'

// Habits, counted on the Mac with no model call. Only counts are kept, per day: which app, which language, which quick
// action. Never what was asked. A habit needs several days of use, so one busy afternoon doesn't become a "habit".

/** How far back counts matter. */
const WINDOW_DAYS = 14
const MIN_DAYS = 3
const MIN_APP_USES = 10

const ACTIONS: Partial<Record<QuickAction, string>> = {
  translate: 'Often asks Otty to translate things',
  proofread: 'Often asks Otty to check their writing',
  summarize: 'Often asks for summaries',
  define: 'Often looks up what words mean'
}

const SHORTER = /\b(shorter|too long|more concise|tl;?dr|briefly|keep it short)\b|簡短|简短|短啲|短一點|短一点|太長|太长/i

interface Count {
  kind: string
  key: string
  day: number
  count: number
}

export interface Habit {
  key: string
  text: string
  kind: MemoryKind
}

/** Local date as YYYYMMDD. */
export function dayNumber(at: Date): number {
  return at.getFullYear() * 10_000 + (at.getMonth() + 1) * 100 + at.getDate()
}

function tally(rows: Count[], kind: string): { key: string; total: number; days: number }[] {
  const by = new Map<string, { key: string; total: number; days: number }>()
  for (const r of rows) {
    if (r.kind !== kind) continue
    const t = by.get(r.key) ?? { key: r.key, total: 0, days: 0 }
    t.total += r.count
    t.days += 1
    by.set(r.key, t)
  }
  return [...by.values()].sort((a, b) => b.total - a.total)
}

/** What the counts add up to. */
export function habitsFrom(rows: Count[]): Habit[] {
  const out: Habit[] = []
  const days = new Set(rows.map((r) => r.day)).size
  if (days < MIN_DAYS) return out

  const apps = tally(rows, 'app')
  const appTotal = apps.reduce((n, a) => n + a.total, 0)
  const main = apps.filter((a) => a.total >= 5 && a.days >= 2 && a.total / appTotal >= 0.25).slice(0, 2)
  if (appTotal >= MIN_APP_USES && main.length) out.push({ key: 'apps', text: `Mostly works in ${main.map((a) => a.key).join(' and ')}`, kind: 'habit' })

  const languages = tally(rows, 'language')
  const languageTotal = languages.reduce((n, l) => n + l.total, 0)
  const other = languages.find((l) => l.key !== 'en')
  if (other && other.total >= 5 && other.days >= 2 && other.total / languageTotal >= 0.5) {
    out.push({ key: 'language', text: `Often wants answers in ${LANGUAGE_SHORT[other.key as Exclude<AnswerLanguage, 'en'>] ?? other.key}`, kind: 'preference' })
  }

  for (const a of tally(rows, 'action')) {
    const text = ACTIONS[a.key as QuickAction]
    if (text && a.total >= 5 && a.days >= 2) out.push({ key: `action:${a.key}`, text, kind: 'habit' })
  }

  const shorter = tally(rows, 'shorter')[0]
  if (shorter && shorter.total >= 3 && shorter.days >= 2) out.push({ key: 'shorter', text: 'Prefers short answers', kind: 'preference' })
  return out
}

export interface Turn {
  app: string | null
  language: AnswerLanguage
  action?: QuickAction
  typed: string
}

/** Counts this question, and returns any habit that's new. */
export function observe(store: MemoryStore, turn: Turn, now = new Date()): Memory[] {
  const day = dayNumber(now)
  if (turn.app) store.count('app', turn.app, day)
  store.count('language', turn.language, day)
  if (turn.action) store.count('action', turn.action, day)
  if (!turn.action && SHORTER.test(turn.typed)) store.count('shorter', 'asked', day)

  const since = dayNumber(new Date(now.getTime() - WINDOW_DAYS * 86_400_000))
  return habitsFrom(store.counts(since)).flatMap((h) => store.saveHabit(h.key, h.text, h.kind, now.getTime()) ?? [])
}

import type { CapStatus, MonthlyCap } from './types'

// The monthly limit (D-33). Pure, so Settings, the job runner and the health banner agree on what "over" means.
// Questions or tokens, never money: a price needs a dated table to be true.

const MAX: Record<MonthlyCap['unit'], number> = { questions: 100_000, tokens: 1_000_000_000 }

/** From the renderer, so it's checked: anything that isn't a sensible cap is no cap. */
export function cleanCap(raw: unknown): MonthlyCap | null {
  if (!raw || typeof raw !== 'object') return null
  const { unit, limit } = raw as Record<string, unknown>
  if (unit !== 'questions' && unit !== 'tokens') return null
  const n = Math.floor(Number(limit))
  if (!Number.isFinite(n) || n < 1) return null
  return { unit, limit: Math.min(n, MAX[unit]) }
}

export function capStatus(cap: MonthlyCap | null, month: { questions: number; tokens: number }): CapStatus | null {
  if (!cap) return null
  const used = month[cap.unit]
  return { ...cap, used, over: used >= cap.limit }
}

/** "1 question", "25 questions", "1 token": a limit of one is singular. */
const amount = (cap: MonthlyCap) => `${cap.limit.toLocaleString()} ${cap.unit === 'questions' ? 'question' : 'token'}${cap.limit === 1 ? '' : 's'}`

const REACHED = 'You’ve reached this month’s limit'

/** Why something Otty would start by itself is waiting. Shown on the Activity row, with "Run it anyway". */
export const capReached = (cap: MonthlyCap): string => `${REACHED} of ${amount(cap)}. Run it anyway?`

/** True for a note written by `capReached`, so the row's button can say "Run it anyway". */
export const isCapNote = (note: string | undefined): boolean => Boolean(note?.startsWith(REACHED))

/** The one line for the user's own questions, which still go through. */
export const capPassed = (cap: MonthlyCap): string =>
  `You’ve passed this month’s limit of ${amount(cap)}. Your own questions still go through, but Otty asks before starting anything by itself.`

/** "2026-11": the month a heads-up was seen in. */
export const monthKey = (now = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

/** D-57: 80% of the limit or more, not yet passed, and not already seen this month. Passed has its own line. */
export function nearCap(status: CapStatus | null, noticed: string | null, now = new Date()): boolean {
  return Boolean(status && !status.over && status.used >= status.limit * 0.8 && noticed !== monthKey(now))
}

/** The heads-up itself: gentle, once, before the limit is a surprise. */
export const capNear = (status: CapStatus): string =>
  `You’ve used ${Math.floor((status.used / status.limit) * 100)}% of this month’s limit of ${amount(status)}. Past it, Otty asks before starting anything by itself.`

/** First of this month, local time. */
export function monthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

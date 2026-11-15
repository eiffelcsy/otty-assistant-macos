import type { DatabaseSync } from 'node:sqlite'

// The usage meter (D-30): how much Otty has asked of the user's AI service, so spending is never a surprise. Only
// counts, kept on the Mac, per local day. Callers count through `count`, which does nothing until main plugs in a
// sink, so tests and background code never need a database to run.

export type UsageKey = 'questions' | 'requests' | 'input' | 'output' | 'cached' | 'searches' | 'pages' | 'jobs'

export interface UsageSink {
  add(key: UsageKey, n: number, now?: Date): void
}

let sink: UsageSink | null = null

export function setUsageSink(s: UsageSink | null): void {
  sink = s
}

/** Never throws: a meter must never be the reason an answer fails. */
export function count(key: UsageKey, n = 1): void {
  if (!n) return
  try {
    sink?.add(key, n)
  } catch (err) {
    console.error('Could not count usage', err)
  }
}

export interface UsageSummary {
  days: number
  questions: number
  /** Requests to the model, including background ones such as titles. */
  requests: number
  tokens: number
  searches: number
  pages: number
  jobs: number
}

/** Local date as YYYYMMDD, the same as habits use. */
const dayNumber = (d: Date) => d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate()

/** Kept in `counters` (kind `usage`), next to habits but never forgotten with them. */
export class UsageMeter implements UsageSink {
  constructor(private db: DatabaseSync) {}

  add(key: UsageKey, n: number, now = new Date()): void {
    this.db
      .prepare("insert into counters(kind, key, day, count) values ('usage', ?, ?, ?) on conflict do update set count = count + excluded.count")
      .run(key, dayNumber(now), n)
  }

  summary(days = 30, now = new Date()): UsageSummary {
    const since = new Date(now)
    since.setDate(since.getDate() - days + 1)
    const rows = this.db.prepare("select key, sum(count) as n from counters where kind = 'usage' and day >= ? group by key").all(dayNumber(since)) as unknown as {
      key: UsageKey
      n: number
    }[]
    const get = (k: UsageKey) => Number(rows.find((r) => r.key === k)?.n ?? 0)
    return {
      days,
      questions: get('questions'),
      requests: get('requests'),
      tokens: get('input') + get('output'),
      searches: get('searches'),
      pages: get('pages'),
      jobs: get('jobs')
    }
  }

  clear(): void {
    this.db.exec("delete from counters where kind = 'usage'")
  }
}

/**
 * How a background look compares with an ordinary question, for its card: "about as much as 30 of your questions".
 * Null until there's enough to say something true.
 */
export function compareWithQuestions(jobTokens: number[], summary: UsageSummary): number | null {
  const done = jobTokens.filter((t) => t > 0).sort((a, b) => a - b)
  if (!done.length || summary.questions < 5 || !summary.tokens) return null
  const perQuestion = summary.tokens / summary.questions
  const typical = done[Math.floor(done.length / 2)]
  return Math.max(1, Math.round(typical / perQuestion))
}

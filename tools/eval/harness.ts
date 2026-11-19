import { runLoop } from '../../src/main/loop'
import { turnHints } from '../../src/main/hints'
import { systemPrompt } from '../../src/main/prompts'
import { toolDefs } from '../../src/main/tools'
import { CHAT_TOOLS } from '../../src/main/toolSafety'
import type { ToolOutcome } from '../../src/main/tools'
import type { Provider, Message } from '../../src/main/providers'
import { buildChart } from '../../src/main/chart'
import { parseTable } from '../../src/shared/table'
import { score } from './score'
import { inScene } from './stubTools'
import type { Call, Case, CaseResult, Trace } from './types'

const ok: ToolOutcome = { result: 'Done.', status: 'done' }

/** What Otty puts around a question, as `userContent` and `turnNote` do. */
export function userText(c: Case, now = new Date('2026-11-09T10:00:00')): string {
  const app = c.app ? `[I'm using ${c.app}.]\n\n` : ''
  const known = c.known ? `\n[What you know about the user: ${c.known}]` : ''
  // The same per-turn hints the app adds (llm.ts), from the user's own words and the app's name.
  const hints = turnHints({ typed: c.typed ?? c.prompt, app: c.app?.split(',')[0] ?? null, learn: true, table: Boolean(c.table) })
    .map((h) => `\n${h}`)
    .join('')
  const capture = c.capture ? `\n\n[Highlighted text:]\n${c.capture}` : ''
  return `${app}${c.prompt}${capture}\n\n[Current local time: ${now.toString().slice(0, 21)}]${known}${hints}`
}

/** Runs one case through the real loop and system prompt, with the model service given. */
export async function runCase(c: Case, provider: Provider, opts: { timeoutMs?: number } = {}): Promise<CaseResult> {
  const history: Message[] = [{ role: 'user', content: userText(c) }]
  const started = performance.now()
  let firstTokenMs: number | null = null
  let answer = ''
  let rounds = 0
  let error: string | undefined
  const cards: string[] = []
  try {
    await inScene({ search: c.search, page: c.page }, () => runLoop({
      provider: () => provider,
      system: systemPrompt(null, true, true),
      history,
      tools: () => toolDefs(CHAT_TOOLS),
      context: {
        allowed: CHAT_TOOLS,
        // As in the app (llm.ts): a capture or a known fact puts the user's own data in the run.
        taint: { private: Boolean(c.capture || c.known), outside: false },
        // Every card is recorded. A careful user says no to sending their own words out in a search, and yes to the rest.
        confirm: async (card) => {
          cards.push(`${card.title}: ${card.query ?? card.host ?? card.item ?? ''}`)
          return card.kind !== 'search'
        },
        // Pages and searches are scripted by the case, so the address is as good as known.
        knownUrl: () => true,
        learn: { remember: () => ok, forget: () => ok },
        showSteps: () => ok,
        startJob: async () => ok,
        scheduleJob: async () => ok,
        makeChart: (args) => chartFor(c, args)
      },
      maxRounds: 6,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      onEvent: (e) => {
        if (e.type === 'text') {
          firstTokenMs ??= performance.now() - started
        }
      },
      onMessage: (m) => {
        if (m.role === 'assistant') {
          rounds++
          // Only the last reply is the answer; earlier ones are the model thinking aloud before a tool.
          answer = typeof m.content === 'string' ? m.content : ''
        }
      }
    }))
  } catch (err) {
    error = (err as Error).message
  }
  const trace: Trace = { calls: callsIn(history), answer, firstTokenMs, totalMs: Math.round(performance.now() - started), rounds, cards, ...(error ? { error } : {}) }
  return { id: c.id, set: c.set, trace, ...score(c.expect, trace) }
}

/** The app's own chart step, on the case's table: what the model gets back is exactly what it would in Otty. */
export function chartFor(c: Case, args: Record<string, unknown>): ToolOutcome {
  const table = c.table ? parseTable(c.table, 'sales.csv') : null
  if (!table) return { result: 'There’s no table in this chat that Otty can read.', status: 'error' }
  const built = buildChart(table, args)
  return typeof built === 'string' ? { result: built, status: 'error' } : { result: built.result, status: 'done' }
}

/** Every tool call the model made, with its arguments, in order. */
export function callsIn(history: Message[]): Call[] {
  const results = new Map(history.flatMap((m) => (m.role === 'tool' ? [[m.tool_call_id, m.content] as const] : [])))
  return history.flatMap((m) =>
    m.role === 'assistant'
      ? (m.tool_calls ?? []).map((tc) => {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch {
            /* bad JSON counts as empty, as the loop treats it */
          }
          const result = results.get(tc.id)
          return { name: tc.function.name, args, ...(result !== undefined ? { result } : {}) }
        })
      : []
  )
}

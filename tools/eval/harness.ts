import { runLoop } from '../../src/main/loop'
import { systemPrompt } from '../../src/main/prompts'
import { toolDefs } from '../../src/main/tools'
import type { ToolOutcome } from '../../src/main/tools'
import type { Provider, Message } from '../../src/main/providers'
import { score } from './score'
import { setScene } from './stubTools'
import type { Call, Case, CaseResult, Trace } from './types'

const ok: ToolOutcome = { result: 'Done.', status: 'done' }

/** What Otty puts around a question, as `userContent` and `turnNote` do. */
export function userText(c: Case, now = new Date('2026-11-09T10:00:00')): string {
  const app = c.app ? `[I'm using ${c.app}.]\n\n` : ''
  const known = c.known ? `\n\n[What you know about the user: ${c.known}]` : ''
  return `${app}${c.prompt}${known}\n\n[Current local time: ${now.toString().slice(0, 21)}]`
}

/** Runs one case through the real loop and system prompt, with the model service given. */
export async function runCase(c: Case, provider: Provider, opts: { timeoutMs?: number } = {}): Promise<CaseResult> {
  setScene({ search: c.search, page: c.page })
  const history: Message[] = [{ role: 'user', content: userText(c) }]
  const started = performance.now()
  let firstTokenMs: number | null = null
  let answer = ''
  let rounds = 0
  let error: string | undefined
  try {
    await runLoop({
      provider: () => provider,
      system: systemPrompt(null, true, true),
      history,
      tools: () => toolDefs(),
      context: {
        confirm: async () => true,
        // Pages and searches are scripted by the case, so the address is as good as known.
        knownUrl: () => true,
        learn: { remember: () => ok, forget: () => ok },
        showSteps: () => ok,
        startJob: async () => ok
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
    })
  } catch (err) {
    error = (err as Error).message
  }
  const trace: Trace = { calls: callsIn(history), answer, firstTokenMs, totalMs: Math.round(performance.now() - started), rounds, ...(error ? { error } : {}) }
  return { id: c.id, set: c.set, trace, ...score(c.expect, trace) }
}

/** Every tool call the model made, with its arguments, in order. */
export function callsIn(history: Message[]): Call[] {
  return history.flatMap((m) =>
    m.role === 'assistant'
      ? (m.tool_calls ?? []).map((tc) => {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch {
            /* bad JSON counts as empty, as the loop treats it */
          }
          return { name: tc.function.name, args }
        })
      : []
  )
}

import type { Message, ToolCall } from '../../src/main/providers'

// Otty eval (D-23). Not shipped. A case is a question plus what a good model does with it.

export type EvalSet = 'math' | 'memory' | 'steps' | 'jobs' | 'injection' | 'code' | 'draw'
export const SETS: readonly EvalSet[] = ['math', 'memory', 'steps', 'jobs', 'injection', 'code', 'draw']

export interface Call {
  name: string
  args: Record<string, unknown>
  /** What the tool said back, so a scorer can tell numbers code worked out from ones the model made up. */
  result?: string
}

/** What happened in one run of one case. */
export interface Trace {
  calls: Call[]
  answer: string
  /** Milliseconds to the first word of the first reply, or null if nothing was said. */
  firstTokenMs: number | null
  totalMs: number
  rounds: number
  error?: string
}

export interface Expect {
  /** How many times each tool should be called, at least and at most. */
  calls?: Record<string, { min?: number; max?: number }>
  /** None of these may be called at all. */
  never?: string[]
  answerHas?: (string | RegExp)[]
  answerLacks?: (string | RegExp)[]
  /** Anything the fields above can't say. Returns why it failed, or null. */
  check?: (t: Trace) => string | null
}

export interface Case {
  id: string
  set: EvalSet
  /** What goes in the user's message: their words, plus any file blocks. */
  prompt: string
  /** What the user typed, when `prompt` holds more (file blocks): what the app's per-turn hints read. */
  typed?: string
  /** The app note, as Otty puts at the start of a message. */
  app?: string
  /** The "what you know about the user" note, as Otty puts at the end. */
  known?: string
  /** What a search returns, when the case needs one. */
  search?: string
  /** What reading a page returns. */
  page?: string
  /** A CSV the user attached, for make_chart (D-35). Charted by the real code, as in the app. */
  table?: string
  expect: Expect
}

export interface Score {
  pass: boolean
  reasons: string[]
}

export interface CaseResult {
  id: string
  set: EvalSet
  pass: boolean
  reasons: string[]
  trace: Trace
}

export type { Message, ToolCall }

import type { UndoKind } from '../ledger'
import type { RunTaint } from '../toolSafety'
import type { ConfirmCard, ConnectionKind } from '../../shared/types'

// What every tool is made of. A tool is one entry in `TOOLS` (`index.ts`), next to its row in `toolSafety.ts`: the
// definition the model sees and when it's offered, its chip, how the ledger can undo it, and how it runs.

export type Args = Record<string, unknown>

export interface ToolContext {
  /** Ask the user to approve a side-effecting action, with a card built in `cards.ts`. `url` is the page it's about. */
  confirm(card: ConfirmCard, url?: string): Promise<boolean>
  /** True when this exact address came from the user, a search or a page, not from the model. */
  knownUrl(url: string): boolean
  /**
   * The only tools this work may use, checked first thing in `runTool`, because a model can call a tool it wasn't
   * offered. Always given: a chat turn passes `CHAT_TOOLS`, a job `JOB_TOOLS` (D-42).
   */
  allowed: ReadonlySet<string>
  /** What the run holds so far (D-41). The loop marks `outside` as results come in. */
  taint?: RunTaint
  /** Work that can be resumed: a change it makes is claimed once per call, so a rerun can't repeat it (D-42). */
  runId?: string
  claims?: Claims
  /** How `remember` and `forget` reach the chat. Left out, this work can't touch what Otty knows. */
  learn?: {
    remember(args: Args): ToolOutcome
    forget(args: Args): ToolOutcome
  }
  /** How tools reach the Mac. Only a chat turn is given them, so a job can never change the Mac. */
  mac?: MacHands
  /** Shows a step card under the answer. Only a chat turn can. */
  showSteps?(args: Args): ToolOutcome
  /** Charts a table the user attached or highlighted in this chat. Only a chat turn has one. */
  makeChart?(args: Args): ToolOutcome
  /** Asks to start a background job. Only a chat turn can, so a job can never start another. */
  startJob?(args: Args): Promise<ToolOutcome>
  /** Asks to run a read-only job later. Only a chat turn can, and always with a card. */
  scheduleJob?(args: Args): Promise<ToolOutcome>
  /** What a change is written down against in the ledger (D-46). Left out, nothing is written. */
  cause?: { chatId?: string; answerId?: string; jobId?: string }
  /** Whose searches and pages these are, for "What left your Mac". */
  sent?: { chatId?: string; group?: string }
}

/** What the tools that change the Mac do there (D-45 step 3). The Mac's own are in `macHands.ts`. */
export interface MacHands {
  /** Opens an http(s) page in the user's browser. */
  open(url: string): Promise<void>
  /** Copies text, with a Markdown table as a real table as well. True when it held one. */
  copy(text: string): Promise<boolean>
  /** Adds a reminder to Apple Reminders, and returns its id, for Undo ('' when Reminders gave none). */
  remind(title: string, due: Date | null): Promise<string>
  /** Removes a reminder Otty added. */
  unremind(id: string): Promise<void>
}

/** Calls already made by work that can be resumed. `claim` is true only the first time for a run and call. */
export interface Claims {
  claim(runId: string, callId: string): Promise<boolean>
}

export interface ToolOutcome {
  result: string
  status: 'done' | 'denied' | 'error'
  /** Replaces the chip's words once the result is known. `copy` is what tapping the chip copies. */
  chip?: { label: string; copy?: string }
  /** How the change can be taken back: the memory or job it made, and what Undo would say (D-46). */
  undo?: { ref: string; label: string }
}

/** A function definition in the shape the providers take (OpenAI's; the Anthropic adapter translates it). */
export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: object }
}

/**
 * Chip text plus a UIcon name (rounded set) for the renderer. `show` says when the chip appears: from the start
 * (the default), only once it's done, or never, for a tool that shows itself some other way.
 */
export interface ToolLabel {
  label: string
  icon: string
  show?: 'running' | 'after' | 'never'
}

/** What decides which tools the model is offered, worked out once per request from the settings. */
export interface Setup {
  /** How the web is reached: DeepSeek's search, the service's own (Claude), the keyless lookup, or not at all. */
  web: 'deepseek' | 'server' | 'lookup' | 'off'
  /** "Let Otty learn about me". */
  learn: boolean
  /** The connections that are on and working (D-54). */
  connections: ReadonlySet<ConnectionKind>
}

export interface Tool {
  /** The definition the model is offered with this setup, or null when it isn't offered. */
  offer(setup: Setup): ToolDef | null
  label(args: Args): ToolLabel
  /** How the ledger can take its change back (D-46). Left out: it can't. */
  undo?: UndoKind
  /** Runs it. Throw only `ToolPause`; anything else thrown becomes a "Tool failed" result. */
  run(args: Args, ctx: ToolContext): Promise<ToolOutcome> | ToolOutcome
}

/** A string argument from the model, which can send anything: a string or number as text, anything else as `fallback`. */
export function text(args: Args, key: string, fallback = ''): string {
  const v = args[key]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback
}

export const declined: ToolOutcome = { result: 'The user declined.', status: 'denied' }

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

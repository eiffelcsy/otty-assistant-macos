import { mathTier } from '../shared/math'

// Short per-turn nudges, added to the turn's note (never the system prompt, so the cache holds), for the cases
// where code knows something the model tends to forget. Found by the eval: with only the system prompt's rules,
// DeepSeek did easy sums in its head and wrote Excel steps as a numbered list. Scaffolds: retest on every model
// upgrade, and remove a hint once the eval passes without it.

/** "How do I…", "how to…", "where do I find…": a question whose answer is likely steps on the Mac. */
const HOW_TO = /^\s*(?:how\s+(?:do|can|should|would)\s+i\b|how\s+to\b|where\s+(?:do|can)\s+i\b|what\s+are\s+the\s+steps\b|steps\s+to\b|show\s+me\s+how\b)|點樣|怎麼|怎样|如何/i

/**
 * Something lasting the user says about themself: "I've been learning…", "I work in…", "my daughter…".
 * Deliberately narrow ("I'm stuck" isn't it). The hint only asks the model to consider remember; guard.ts decides.
 */
const ABOUT_ME = /\bI(?:'|’)ve been \w+ing\b|\bI(?:'|’)m (?:learning|studying|training for|moving to|allergic to)\b|\bI (?:work (?:as|at|in|for)|live in|study|teach)\b|\bmy (?:job|son|daughter|wife|husband|partner|kids?|children|boss|school|university)\b|我(?:學緊|学紧|在學|在学|住喺|住在|做緊)|我嘅(?:仔|女|老公|老婆|工作)/i

export interface HintInput {
  typed: string
  /** A snip or picture came with the question. */
  picture?: boolean
  /** The app the user is in, if Otty knows it. */
  app?: string | null
  /** "Let Otty learn about me" is on. */
  learn?: boolean
}

export function turnHints({ typed, picture = false, app, learn = false }: HintInput): string[] {
  const hints: string[] = []
  const tier = mathTier(typed, picture)
  if (tier === 'calculation' || tier === 'problem') hints.push('[This needs numbers worked out: use calculate for them, even easy ones.]')
  if (HOW_TO.test(typed)) hints.push(`[If the answer is steps I'll do ${app ? `in ${app}` : 'on my Mac'}, use show_steps, not a numbered list.]`)
  if (learn && ABOUT_ME.test(typed)) hints.push('[I said something about myself: if it will still matter in a month, remember it.]')
  return hints
}

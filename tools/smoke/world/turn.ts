/** One scripted model reply, in a shape that doesn't depend on the API format (D-47). */

/** A search the service runs by itself (Claude's server-side web search). Other formats ignore it. */
export interface ServerSearch {
  query: string
  results: { title: string; url: string; age?: string }[]
}

export interface Turn {
  say?: string
  think?: string
  calls?: { name: string; args: Record<string, unknown> }[]
  /** Searches the service ran before it answered. Only Anthropic's format has them. */
  searches?: ServerSearch[]
  usage?: { input: number; output: number; cached?: number }
  /** Why it stopped, when it isn't the natural end or a tool call. */
  stop?: 'length' | 'refusal'
  /** Answer with this HTTP status instead. */
  status?: number
  error?: string
}

export const DEFAULT_USAGE: NonNullable<Turn['usage']> = { input: 100, output: 20 }

/** The reply split into a few chunks, so streaming code sees more than one. */
export function pieces(text: string): string[] {
  const words = text.split(/(?<= )/)
  const size = Math.max(1, Math.ceil(words.length / 4))
  const out: string[] = []
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(''))
  return out
}

import type { AnswerLanguage } from '../shared/types'

/** Enough for a long session, and small enough to forget about. */
const MAX_ENTRIES = 200
const MAX_WARMED = 3

type Fetcher = (term: string, around: string, language: AnswerLanguage) => Promise<string>

/**
 * Explanations by language and term. An unfinished fetch is kept too, so a tap during a warm-up shares the call.
 * A failed one is dropped, so the next tap tries again.
 */
export function createExplainCache(fetcher: Fetcher): Fetcher {
  const entries = new Map<string, Promise<string>>()
  return (term, around, language) => {
    const key = `${language}:${term.toLowerCase()}`
    const hit = entries.get(key)
    if (hit) return hit
    const entry = fetcher(term, around, language)
    entries.set(key, entry)
    entry.catch(() => {
      if (entries.get(key) === entry) entries.delete(key)
    })
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!)
    return entry
  }
}

/** The explain terms worth fetching ahead of a tap: the first few, once each. */
export function termsToWarm(answer: string): string[] {
  const terms = new Map<string, string>()
  for (const [, term] of answer.matchAll(/\[([^\]]+)\]\(#explain\)/g)) {
    if (!terms.has(term.toLowerCase())) terms.set(term.toLowerCase(), term)
  }
  return [...terms.values()].slice(0, MAX_WARMED)
}

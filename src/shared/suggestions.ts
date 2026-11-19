// "Try asking" on an empty chat. Otty can do more than people guess, and the only way in to most of it is asking in
// words, so the empty state shows a few real things to ask: one or two for the app they came from, then one each for
// the abilities nobody finds alone (checking later, looking into something big, remembering).

export interface Suggestion {
  /** What goes in the box. Never sent by itself: the user reads it, edits it and presses send. */
  text: string
  icon: string
}

const FOR_APP: { match: RegExp; items: Suggestion[] }[] = [
  { match: /excel|numbers|sheets/i, items: [{ text: 'How do I freeze the top row?', icon: 'list' }] },
  { match: /word|pages|docs/i, items: [{ text: 'How do I add page numbers?', icon: 'list' }] },
  { match: /mail|outlook|gmail/i, items: [{ text: 'Help me write a polite reply saying no', icon: 'pencil' }] },
  { match: /safari|chrome|firefox|arc|edge/i, items: [{ text: 'Summarise this page in 3 points', icon: 'text' }] },
  { match: /finder/i, items: [{ text: 'How do I find the biggest files on my Mac?', icon: 'search' }] },
  { match: /zoom|teams|facetime|meet/i, items: [{ text: 'How do I share just one window?', icon: 'list' }] }
]

const ABILITIES: Suggestion[] = [
  { text: 'Check the price of a Japan rail pass tomorrow at 9', icon: 'alarm-clock' },
  { text: 'Look into the best laptop under $1,000 across several review sites', icon: 'binoculars' },
  { text: 'Remember that I like short answers', icon: 'bookmark' }
]

/** What Otty knows that can shape the list: only the kind, the words and whether it's in use. */
type Known = { text: string; kind: string; status: string }

/** "Is learning Spanish" → "learning Spanish": a goal as Otty notes it, ready to go in a sentence. */
const goalWords = (text: string) =>
  text
    .trim()
    .replace(/^(is|wants to|wants|would like to|plans to|hopes to|trying to)\s+/i, '')
    .replace(/[.!]+$/, '')

/**
 * Up to four, most personal first: the app, then a goal Otty knows about, then the abilities. Once Otty knows anything,
 * "Remember…" has done its job and makes room. Learning off means nothing known is used here either.
 */
export function suggestionsFor(app: string | null | undefined, learn: boolean, web: boolean, known: Known[] = []): Suggestion[] {
  const fromApp = (app && FOR_APP.find((a) => a.match.test(app))?.items) || []
  const using = learn ? known.filter((m) => m.status === 'active') : []
  const goal = using.find((m) => m.kind === 'goal' && goalWords(m.text).length <= 60)
  const fromMemory: Suggestion[] = goal ? [{ text: `What’s one small step for ${goalWords(goal.text)} today?`, icon: 'bullseye' }] : []
  const abilities = ABILITIES.filter((s) => (s.icon === 'bookmark' ? learn && using.length === 0 : web))
  return [...fromApp, ...fromMemory, ...abilities].slice(0, 4)
}

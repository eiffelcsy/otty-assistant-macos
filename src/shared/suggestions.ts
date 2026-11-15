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

export function suggestionsFor(app: string | null | undefined, learn: boolean, web: boolean): Suggestion[] {
  const fromApp = (app && FOR_APP.find((a) => a.match.test(app))?.items) || []
  const abilities = ABILITIES.filter((s) => (s.icon === 'bookmark' ? learn : web))
  return [...fromApp, ...abilities].slice(0, 4)
}

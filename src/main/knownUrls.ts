import type { Message } from './providers'

// A hostile page can tell the model to "read" an address with private text inside it. So read_page only goes
// straight to addresses that exist outside the model: what the user sent, and what a search or page returned.
// The match is exact, so a known address with data added to it counts as new. The model's own messages never count.

const URL_PATTERN = /https?:\/\/[^\s<>"'`，。、；：）】」》]+/gi
const TRAILING_PUNCTUATION = /[.,;:!?)\]}*_~”’]+$/

/** The tools whose results carry addresses from the web. Other results can echo what the model passed in. */
const WEB_TOOLS = new Set(['search_web', 'read_page'])

function normalized(url: string): string | null {
  try {
    return new URL(url).href
  } catch {
    return null
  }
}

/** Every address in some text. Punctuation around one is ambiguous, so each reading is kept. */
export function urlsIn(text: string): string[] {
  const found = new Set<string>()
  for (const [raw] of text.matchAll(URL_PATTERN)) {
    for (const reading of [raw, raw.replace(TRAILING_PUNCTUATION, ''), raw.split(')')[0]]) {
      const href = normalized(reading)
      if (href) found.add(href)
    }
  }
  return [...found]
}

function userText(content: Extract<Message, { role: 'user' }>['content']): string {
  if (typeof content === 'string') return content
  return content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
}

/** Addresses in a service's own search results. Only those blocks: the model's text in the same reply never counts. */
function searchResultUrls(m: Message): string[] {
  if (m.role !== 'assistant' || !m.provider) return []
  return (m.provider.blocks as { type?: string; content?: unknown }[]).flatMap((block) => {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) return []
    return (block.content as { url?: unknown }[]).flatMap((r) => (typeof r.url === 'string' ? [normalized(r.url) ?? ''] : []))
  })
}

export function isKnownUrl(url: string, history: Message[]): boolean {
  const href = normalized(url)
  if (!href) return false
  const toolNames = new Map<string, string>()
  for (const m of history) {
    if (m.role === 'assistant') for (const call of m.tool_calls ?? []) toolNames.set(call.id, call.function.name)
    const fromUser = m.role === 'user' ? userText(m.content) : ''
    const fromWeb = m.role === 'tool' && WEB_TOOLS.has(toolNames.get(m.tool_call_id) ?? '') ? m.content : ''
    if (urlsIn(fromUser + '\n' + fromWeb).includes(href) || searchResultUrls(m).includes(href)) return true
  }
  return false
}

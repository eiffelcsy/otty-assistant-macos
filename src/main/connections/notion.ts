// D-54: Notion, read with the token the user pasted. Titles and pages come back masked and cut.
import { send } from '../net'
import { maskSecrets } from '../../shared/secrets'
import { ConnectionError, LIMITS, type NotionHit } from './types'

const BASE = 'https://api.notion.com/v1'
const AUTH = 'Notion didn’t accept that token. Check you copied the whole secret.'

async function getJson(url: string, init: RequestInit & { headers: Record<string, string> }): Promise<any> {
  let res: Response
  try {
    res = await send(url, { ...init, signal: AbortSignal.timeout(LIMITS.connectMs) })
  } catch {
    throw new ConnectionError(`Otty can’t reach ${new URL(url).hostname}. Check the address and your connection.`, 'network')
  }
  if (res.status === 401 || res.status === 403) throw new ConnectionError(AUTH, 'auth')
  if (!res.ok) throw new ConnectionError(`Notion didn’t answer as expected (error ${res.status}). Try again later.`, 'bad')
  return res.json().catch(() => {
    throw new ConnectionError('Notion didn’t answer as expected (error 200). Try again later.', 'bad')
  })
}

const headers = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  'Notion-Version': '2022-06-28'
})

const plain = (parts: unknown): string =>
  Array.isArray(parts) ? parts.map((p) => (typeof p?.plain_text === 'string' ? p.plain_text : '')).join('') : ''

/** A page's title is its `title` property; a database's is its top-level `title`. */
function titleOf(obj: any): string {
  const prop = obj?.object === 'database' ? undefined : Object.values<any>(obj?.properties ?? {}).find((p) => p?.type === 'title')
  const text = prop ? plain(prop.title) : plain(obj?.title)
  return maskSecrets(text).text.slice(0, 200).trim() || 'Untitled'
}

/** The name on the token, for "signed in as". */
export async function checkNotion(token: string): Promise<string> {
  const me = await getJson(`${BASE}/users/me`, { headers: headers(token) })
  const name = me?.name ?? me?.bot?.owner?.user?.name
  return typeof name === 'string' && name ? maskSecrets(name).text.slice(0, 100) : 'your workspace'
}

/** Pages and databases the token can see, matching `query`. */
export async function notionSearch(token: string, query: string): Promise<NotionHit[]> {
  const data = await getJson(`${BASE}/search`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query.slice(0, 200), page_size: LIMITS.notionHits })
  })
  return (Array.isArray(data?.results) ? data.results : []).map((r: any) => ({
    id: String(r.id),
    title: titleOf(r),
    edited: Date.parse(r.last_edited_time),
    url: typeof r.url === 'string' ? r.url : undefined
  }))
}

/** A page's title and its text (headings, lists and to-dos as plain lines), cut to `LIMITS.notionWords` words. */
export async function notionPage(token: string, id: string): Promise<{ title: string; text: string }> {
  if (!/^[0-9a-fA-F-]{32,36}$/.test(id)) throw new ConnectionError('That isn’t a Notion page Otty can open.', 'bad')
  const page = await getJson(`${BASE}/pages/${id}`, { headers: headers(token) })
  const title = titleOf(page)

  const lines: string[] = []
  let cursor: string | undefined
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ page_size: '100' })
    if (cursor) q.set('start_cursor', cursor)
    const data = await getJson(`${BASE}/blocks/${id}/children?${q}`, { headers: headers(token) })
    for (const block of Array.isArray(data?.results) ? data.results : []) {
      const line = blockLine(block)
      if (line) lines.push(line)
    }
    if (!data?.has_more || !data?.next_cursor) break
    cursor = data.next_cursor
  }

  let text = lines.join('\n')
  const words = [...text.matchAll(/\S+/g)]
  if (words.length > LIMITS.notionWords) {
    text = text.slice(0, words[LIMITS.notionWords].index).trimEnd() + '\n…'
  }
  return { title, text: maskSecrets(text).text }
}

/** One block as a line of text, or '' when it has no words. */
function blockLine(block: any): string {
  const body = block?.[block?.type] ?? {}
  const text = plain(body.rich_text)
  if (!text.trim()) return ''
  switch (block.type) {
    case 'heading_1':
      return `# ${text}`
    case 'heading_2':
      return `## ${text}`
    case 'heading_3':
      return `### ${text}`
    case 'bulleted_list_item':
      return `- ${text}`
    case 'numbered_list_item':
      return `1. ${text}`
    case 'to_do':
      return `${body.checked ? '[x] ' : '[ ] '}${text}`
    default:
      return text
  }
}

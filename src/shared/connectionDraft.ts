import type { ConnectionDraft, ConnectionKind, McpAuth } from './types'

// D-54: a ```connection block from the model. It only shows a card; nothing connects until the user presses the button.
// Any token, key or secret the model writes is dropped here, so none can reach a form.

const KINDS: ConnectionKind[] = ['apple', 'google', 'canvas', 'notion', 'mcp']
const AUTHS: McpAuth[] = ['none', 'token', 'oauth']

/** The draft in a ```connection block, or null when it isn't one we can show. */
export function connectionDraft(code: string): ConnectionDraft | null {
  let raw: unknown
  try {
    raw = JSON.parse(code)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  const service = d.service as ConnectionKind
  if (!KINDS.includes(service)) return null
  if (service !== 'mcp') return { kind: service }
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 40) : ''
  if (!name || typeof d.url !== 'string') return null
  let protocol: string
  try {
    protocol = new URL(d.url).protocol
  } catch {
    return null
  }
  if (protocol !== 'http:' && protocol !== 'https:') return null
  const auth = AUTHS.includes(d.auth as McpAuth) ? (d.auth as McpAuth) : 'oauth'
  return { kind: 'mcp', name, url: d.url, auth }
}

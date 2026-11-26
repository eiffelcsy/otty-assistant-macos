/**
 * The fake services behind Settings › Connections (D-54, docs/design/specs/10-connections.md): Canvas, Notion, Google
 * and two MCP servers (one takes a key, one signs in in the browser). Each answers the requests the real service
 * would, in the shape `src/main/connections/` reads, and nothing else. Specs change `world.connections` to set a token,
 * change a tool, or read what was revoked or called.
 */

export interface McpTool {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean }
}

export interface ConnectionsWorld {
  /** Tokens Google was asked to revoke, in order. */
  revoked: string[]
  /** When set, the MCP server at mcp.example.com needs `Bearer <this>`. */
  mcpToken?: string
  /** What the MCP servers list. A spec can change one to test a tool that changed on the server. */
  mcpTools: McpTool[]
  /** Every tool call the MCP servers received. */
  mcpCalls: { name: string; args: Record<string, unknown> }[]
  /** The text a tool call answers with. */
  mcpCall: (name: string, args: Record<string, unknown>) => string
}

export interface Answer {
  status: number
  headers?: Record<string, string>
  /** An object is sent as JSON; a string as it is. Nothing when absent. */
  body?: unknown
}

export interface Asked {
  url: URL
  method: string
  /** Parsed JSON, or the raw text (a form). */
  body: unknown
  authorization?: string
}

const LIST_ISSUES: McpTool = {
  name: 'list_issues',
  description: 'Lists open issues',
  inputSchema: { type: 'object', properties: { team: { type: 'string' } } },
  annotations: { readOnlyHint: true }
}
const CREATE_ISSUE: McpTool = {
  name: 'create_issue',
  description: 'Creates an issue',
  inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }
}

export const freshConnections = (): ConnectionsWorld => ({
  revoked: [],
  mcpTools: [{ ...LIST_ISSUES }, { ...CREATE_ISSUE }],
  mcpCalls: [],
  mcpCall: (name) => (name === 'list_issues' ? 'Open issues: #1 Kelp forests need water.' : 'Created issue #2.')
})

const NOTION_PAGE = '0123456789abcdef0123456789abcdef'

const ok = (body: unknown): Answer => ({ status: 200, body })
const denied = (): Answer => ({ status: 401, body: { error: 'unauthorized' } })
const missing = (): Answer => ({ status: 404 })
const bearer = (a: Asked, token: string) => a.authorization === `Bearer ${token}`
const fields = (body: unknown) => new URLSearchParams(typeof body === 'string' ? body : '')
const at = (days: number, hour: number) => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hour).toISOString()
}
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

/** The answer for a request to one of the fake services, or null when the host isn't one of them. */
export function answerConnection(a: Asked, s: ConnectionsWorld): Answer | null {
  switch (a.url.host) {
    case 'canvas.example.edu':
      return canvas(a)
    case 'api.notion.com':
      return notion(a)
    case 'oauth2.googleapis.com':
      return googleAuth(a, s)
    case 'www.googleapis.com':
      return google(a)
    case 'mcp.example.com':
      return a.url.pathname === '/mcp' ? mcp(a, s) : missing()
    case 'auth-mcp.example.com':
      return authMcp(a, s)
    default:
      return null
  }
}

function canvas(a: Asked): Answer {
  if (!bearer(a, 'canvas-token')) return denied()
  switch (a.url.pathname) {
    case '/api/v1/users/self':
      return ok({ name: 'Sam Otter' })
    case '/api/v1/planner/items':
      return ok([
        { plannable_type: 'assignment', plannable: { title: 'Essay on kelp forests' }, plannable_date: inDays(2), context_name: 'Marine Biology', html_url: '/courses/1/assignments/9' },
        { plannable_type: 'quiz', plannable: { title: 'Tide pools quiz' }, plannable_date: inDays(4), context_name: 'Marine Biology', html_url: '/courses/1/quizzes/3' }
      ])
    case '/api/v1/courses':
      return ok([{ id: 1, name: 'Marine Biology' }])
    case '/api/v1/announcements':
      return ok([{ title: 'Field trip on Friday', context_code: 'course_1', posted_at: inDays(-1), message: '<p>Bring <b>boots</b>.</p>' }])
    default:
      return missing()
  }
}

const notionPage = () => ({
  object: 'page',
  id: NOTION_PAGE,
  url: `https://www.notion.so/Field-notes-${NOTION_PAGE}`,
  last_edited_time: new Date().toISOString(),
  properties: { Name: { type: 'title', title: [{ plain_text: 'Field notes' }] } }
})
const paragraph = (text: string) => ({ type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } })

function notion(a: Asked): Answer {
  if (a.authorization !== 'Bearer notion-token') return denied()
  const path = a.url.pathname
  if (path === '/v1/users/me') return ok({ name: 'Otty integration' })
  if (path === '/v1/search' && a.method === 'POST') return ok({ results: [notionPage()] })
  if (path === `/v1/pages/${NOTION_PAGE}`) return ok(notionPage())
  if (path === `/v1/blocks/${NOTION_PAGE}/children`)
    return ok({ results: [paragraph('Otters line up to hold hands.'), paragraph('Kelp is their nursery.')] })
  return missing()
}

function googleAuth(a: Asked, s: ConnectionsWorld): Answer {
  const path = a.url.pathname
  if (path === '/token' && a.method === 'POST') {
    const f = fields(a.body)
    if (f.get('grant_type') === 'authorization_code' && f.get('code') === 'smoke-code')
      return ok({ access_token: 'google-access', refresh_token: 'google-refresh', expires_in: 3600 })
    return { status: 400, body: { error: 'invalid_grant' } }
  }
  if (path === '/revoke' && a.method === 'POST') {
    s.revoked.push(fields(a.body).get('token') ?? '')
    return ok({})
  }
  return missing()
}

function google(a: Asked): Answer {
  if (!bearer(a, 'google-access')) return denied()
  const path = a.url.pathname
  if (path === '/calendar/v3/users/me/calendarList') return ok({ items: [{ id: 'primary', summary: 'Sam' }] })
  if (path === '/calendar/v3/calendars/primary/events')
    return ok({
      items: [
        {
          summary: 'Dentist',
          start: { dateTime: at(1, 10) },
          end: { dateTime: at(1, 11) },
          attendees: [{ email: 'dr.jones@clinic.example' }],
          description: 'Notes: bring the insurance card'
        }
      ]
    })
  return missing()
}

/** MCP over HTTP: one JSON-RPC answer per POST, always as plain JSON (never SSE). */
function mcp(a: Asked, s: ConnectionsWorld): Answer {
  if (a.method === 'GET') return { status: 405 }
  if (a.method === 'DELETE') return { status: 200 }
  if (s.mcpToken && a.authorization !== `Bearer ${s.mcpToken}`) return denied()
  return rpc(a.body, s)
}

function rpc(body: unknown, s: ConnectionsWorld): Answer {
  const m = (body ?? {}) as { id?: number | string; method?: string; params?: Record<string, any> }
  if (m.id === undefined) return { status: 202 }
  const reply = (result: unknown): Answer => ok({ jsonrpc: '2.0', id: m.id, result })
  switch (m.method) {
    case 'initialize':
      return reply({
        protocolVersion: m.params?.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'Fake Linear', version: '1' }
      })
    case 'tools/list':
      return reply({ tools: s.mcpTools })
    case 'tools/call': {
      const name = String(m.params?.name)
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>
      s.mcpCalls.push({ name, args })
      return reply({ content: [{ type: 'text', text: s.mcpCall(name, args) }] })
    }
    default:
      return ok({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found' } })
  }
}

/** The MCP server that signs in in the browser: its own discovery, registration and token endpoints. */
function authMcp(a: Asked, s: ConnectionsWorld): Answer {
  const base = 'https://auth-mcp.example.com'
  const path = a.url.pathname
  if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp')
    return ok({ resource: `${base}/mcp`, authorization_servers: [base] })
  if (path === '/.well-known/oauth-authorization-server')
    return ok({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none']
    })
  if (path === '/register' && a.method === 'POST') return ok({ client_id: 'smoke-mcp-client', ...(a.body as Record<string, unknown>) })
  if (path === '/token' && a.method === 'POST') {
    if (fields(a.body).get('code') === 'smoke-mcp-code')
      return ok({ access_token: 'mcp-access', token_type: 'Bearer', refresh_token: 'mcp-refresh', expires_in: 3600 })
    return { status: 400, body: { error: 'invalid_grant' } }
  }
  if (path === '/mcp') {
    if (a.method === 'GET') return { status: 405 }
    if (a.method === 'DELETE') return { status: 200 }
    if (!bearer(a, 'mcp-access'))
      return {
        status: 401,
        headers: { 'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"` },
        body: { error: 'unauthorized' }
      }
    return rpc(a.body, s)
  }
  return missing()
}

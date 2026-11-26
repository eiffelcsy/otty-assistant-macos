import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type * as OAuth from '../oauth'
import type { SavedConnection, SavedTool, Secret } from '../types'
import {
  callTool,
  canonical,
  checkAddress,
  forgetClient,
  listTools,
  mcpToolName,
  pinOf,
  plainName,
  reconcile,
  signInMcp,
  turnOn,
  type ListedTool
} from '../mcp'

// The store's secret and connection, and the browser's URLs, held here so the OAuth tests can read them.
const env = vi.hoisted(() => ({
  conn: undefined as SavedConnection | undefined,
  secret: {} as Secret,
  opened: [] as string[],
  code: 'the-code'
}))

// No network for the pure parts; the integration tests talk to servers on 127.0.0.1 through the real fetch.
vi.mock('../../net', () => ({ send: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init) }))
vi.mock('../store', () => ({
  unlockSecret: () => env.secret,
  updateSecret: (_id: string, change: (s: Secret) => Secret) => {
    env.secret = change(env.secret)
  },
  savedConnection: () => env.conn
}))
vi.mock('../oauth', async importOriginal => ({
  ...(await importOriginal<typeof OAuth>()),
  newState: () => 'state',
  catchRedirect: async () => ({ redirectUri: 'http://127.0.0.1:1/callback', code: Promise.resolve(env.code), close() {} }),
  openInBrowser: async (url: string) => {
    env.opened.push(url)
  }
}))

const SCHEMA = { type: 'object', properties: { text: { type: 'string' } } }

function tool(over: Partial<SavedTool> = {}): SavedTool {
  return {
    name: 'echo',
    title: 'Echo',
    description: 'Repeats text',
    schema: SCHEMA,
    readOnly: true,
    on: false,
    pin: pinOf('echo', 'Repeats text', SCHEMA),
    ...over
  }
}

const listed = (over: Partial<{ name: string; description: string; schema: Record<string, unknown> }> = {}) => ({
  name: 'echo',
  title: 'Echo',
  description: 'Repeats text',
  schema: SCHEMA,
  readOnly: true,
  ...over
})

describe('plainName', () => {
  it('turns a tool name into words people read', () => {
    expect(plainName('list_issues')).toBe('List issues')
    expect(plainName('createIssue')).toBe('Create issue')
    expect(plainName('get-page')).toBe('Get page')
  })
})

describe('checkAddress', () => {
  it('accepts https and local http', () => {
    expect(checkAddress(' https://mcp.example.com/mcp ').hostname).toBe('mcp.example.com')
    expect(checkAddress('http://localhost:3000/mcp').hostname).toBe('localhost')
    expect(checkAddress('http://127.0.0.1/mcp').hostname).toBe('127.0.0.1')
    expect(checkAddress('http://[::1]:8080/mcp').hostname).toBe('[::1]')
  })
  it('refuses other http, credentials and other schemes', () => {
    expect(() => checkAddress('http://example.com/mcp')).toThrow()
    expect(() => checkAddress('https://user:pw@x.example.com/mcp')).toThrow()
    expect(() => checkAddress('https://user@x.example.com/mcp')).toThrow()
    expect(() => checkAddress('ftp://example.com/mcp')).toThrow()
    expect(() => checkAddress('not a url')).toThrow()
  })
})

describe('canonical and pins', () => {
  it('sorts object keys deeply and keeps array order', () => {
    expect(canonical({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 3 } })).toBe('{"a":{"c":3,"d":[{"y":2,"z":1}]},"b":1}')
  })
  it('pins are stable across key order and change with the description', () => {
    const a = pinOf('x', 'd', { type: 'object', a: 1, b: 2 })
    const b = pinOf('x', 'd', { b: 2, a: 1, type: 'object' })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(pinOf('x', 'other', { type: 'object', a: 1, b: 2 })).not.toBe(a)
  })
  it('mcpToolName sanitises and cuts to 64 characters', () => {
    expect(mcpToolName('mcp-abcdef123456', 'list pages!')).toBe('mcp_abcdef_list_pages_')
    expect(mcpToolName('mcp-abcdef123456', 'x'.repeat(100))).toHaveLength(64)
  })
})

describe('reconcile', () => {
  const pin = (over: Partial<ListedTool> = {}) => pinOf(listed(over).name, listed(over).description, listed(over).schema)
  it('keeps an on tool on with the same pin and drops changed', () => {
    const saved = [tool({ on: true, changed: true })]
    const [r] = reconcile(saved, [listed()])
    expect(r.on).toBe(true)
    expect(r.changed).toBeUndefined()
    expect('changed' in r).toBe(false)
  })
  it('turns an on tool off and flags it when the pin differs, keeping the old pin', () => {
    const old = tool({ on: true })
    const [r] = reconcile([old], [listed({ description: 'Now does more' })])
    expect(r.on).toBe(false)
    expect(r.changed).toBe(true)
    expect(r.pin).toBe(old.pin)
    expect(r.description).toBe('Now does more')
  })
  it('keeps a changed tool changed while it still differs', () => {
    const old = tool({ on: false, changed: true })
    const [r] = reconcile([old], [listed({ description: 'Again different' })])
    expect(r.on).toBe(false)
    expect(r.changed).toBe(true)
    expect(r.pin).toBe(old.pin)
  })
  it('clears changed when the server reverts to the pinned version', () => {
    const [r] = reconcile([tool({ changed: true, pin: pin() })], [listed()])
    expect(r.changed).toBeUndefined()
    expect(r.on).toBe(false)
  })
  it('re-pins an off tool whose listing changed, without changed', () => {
    const [r] = reconcile([tool({ on: false, pin: 'old' })], [listed({ description: 'new' })])
    expect(r.on).toBe(false)
    expect(r.changed).toBeUndefined()
    expect(r.pin).toBe(pinOf('echo', 'new', SCHEMA))
  })
  it('lists a new tool off and drops tools no longer listed, in listed order', () => {
    const saved = [tool({ name: 'gone', on: true })]
    const out = reconcile(saved, [listed({ name: 'fresh' }), listed({ name: 'other' })])
    expect(out.map(t => t.name)).toEqual(['fresh', 'other'])
    expect(out.every(t => !t.on)).toBe(true)
  })
})

describe('turnOn', () => {
  it('re-pins and clears changed when turned on', () => {
    const t = turnOn(tool({ on: false, changed: true, pin: 'old', description: 'new text' }), true)
    expect(t.on).toBe(true)
    expect('changed' in t).toBe(false)
    expect(t.pin).toBe(pinOf('echo', 'new text', SCHEMA))
  })
  it('turns off without touching the pin', () => {
    const old = tool({ on: true })
    expect(turnOn(old, false)).toEqual({ ...old, on: false })
  })
})

describe.each([true, false])('MCP round trip against an in-process server (JSON replies: %s)', json => {
  let server: Server
  let conn: SavedConnection

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => void handle(req, res))
    async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const mcp = new McpServer({ name: 'test', version: '1' })
      mcp.registerTool(
        'echo',
        {
          description: 'Repeats text',
          inputSchema: { text: z.string() },
          annotations: { readOnlyHint: true }
        },
        async ({ text }) => ({ content: [{ type: 'text', text }] })
      )
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: json })
      res.on('close', () => {
        void transport.close()
        void mcp.close()
      })
      await mcp.connect(transport)
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
      await transport.handleRequest(req, res, body)
    }
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    conn = { id: 'mcp-abcdef123456', kind: 'mcp', label: 'Test', url: `http://127.0.0.1:${port}/mcp`, auth: 'none', added: 0 }
  })

  afterAll(async () => {
    forgetClient(conn.id)
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('lists the echo tool as read-only', async () => {
    const tools = await listTools(conn)
    const echo = tools.find(t => t.name === 'echo')
    expect(echo?.readOnly).toBe(true)
    expect(echo?.title).toBe('Echo')
    expect(echo?.description).toBe('Repeats text')
  })

  it('calls the echo tool and returns its text', async () => {
    const result = await callTool(conn, 'echo', { text: 'hello there' })
    expect(result).toEqual({ text: 'hello there', isError: false })
  })
})

// A tiny hand-written server: each route gets the request body and answers with JSON, or a status.
type Reply = { status?: number; json?: unknown; headers?: Record<string, string> }
type Route = (req: IncomingMessage, body: string) => Reply

async function fakeServer(routesOf: (base: string) => Record<string, Route>) {
  let base = ''
  let routes: Record<string, Route> = {}
  async function respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const route = routes[`${req.method} ${new URL(req.url ?? '/', base).pathname}`]
    const reply: Reply = route ? route(req, Buffer.concat(chunks).toString('utf8')) : { status: 404 }
    res.writeHead(reply.status ?? 200, { 'content-type': 'application/json', ...reply.headers })
    res.end(reply.json === undefined ? '' : JSON.stringify(reply.json))
  }
  const server = createServer((req, res) => void respond(req, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  routes = routesOf(base)
  return { base, close: () => new Promise<void>(resolve => server.close(() => resolve())) }
}

const answer = (body: string, result: unknown): Reply => ({ json: { jsonrpc: '2.0', id: (JSON.parse(body) as { id: number }).id, result } })

describe('OAuth connections', () => {
  it('refreshes a rejected token once and retries with the new one', async () => {
    let refreshes = 0
    let rejected = 0
    const srv = await fakeServer(() => ({
      'POST /mcp': (req, body) => {
        if (req.headers.authorization !== 'Bearer new') {
          rejected++
          return { status: 401 }
        }
        const msg = JSON.parse(body) as { method: string }
        if (msg.method === 'notifications/initialized') return { status: 202 }
        if (msg.method === 'initialize') return answer(body, { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 't', version: '1' } })
        return answer(body, { tools: [{ name: 'echo', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] })
      },
      'POST /token': (_req, body) => {
        refreshes++
        const form = new URLSearchParams(body)
        if (form.get('grant_type') !== 'refresh_token' || form.get('refresh_token') !== 'r1') return { status: 400 }
        return { json: { access_token: 'new', refresh_token: 'r2', expires_in: 3600 } }
      }
    }))
    const conn: SavedConnection = { id: 'mcp-bbbbbb000001', kind: 'mcp', label: 'Test', url: `${srv.base}/mcp`, auth: 'oauth', added: 0 }
    env.conn = conn
    env.secret = {
      tokens: { access_token: 'old', refresh_token: 'r1', expires_at: Date.now() + 3_600_000, token_endpoint: `${srv.base}/token`, resource: `${srv.base}/mcp` },
      client: { client_id: 'cid', redirect_uris: [], issuer: srv.base }
    }
    try {
      const tools = await listTools(conn)
      expect(tools.map(t => t.name)).toEqual(['echo'])
      expect(rejected).toBe(1)
      expect(refreshes).toBe(1)
      expect((env.secret.tokens as { access_token: string }).access_token).toBe('new')
      expect((env.secret.tokens as { refresh_token: string }).refresh_token).toBe('r2')
    } finally {
      forgetClient(conn.id)
      await srv.close()
    }
  })

  it('signs in through discovery, registration and PKCE, and keeps the tokens', async () => {
    const srv = await fakeServer(base => ({
      'POST /mcp': () => ({ status: 401, headers: { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` } }),
      'GET /.well-known/oauth-protected-resource/mcp': () => ({ json: { resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['mcp.read'] } }),
      'GET /.well-known/oauth-authorization-server': () => ({
        json: { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register` }
      }),
      'POST /register': (_req, body) => {
        const reg = JSON.parse(body) as { client_name: string }
        if (reg.client_name !== 'Otty') return { status: 400 }
        return { status: 201, json: { client_id: 'cid-1' } }
      },
      'POST /token': (_req, body) => {
        const form = new URLSearchParams(body)
        if (form.get('grant_type') !== 'authorization_code' || form.get('code') !== 'the-code' || form.get('client_id') !== 'cid-1' || !form.get('code_verifier')) {
          return { status: 400 }
        }
        return { json: { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 } }
      }
    }))
    const conn: SavedConnection = { id: 'mcp-bbbbbb000002', kind: 'mcp', label: 'Test', url: `${srv.base}/mcp`, auth: 'oauth', added: 0 }
    env.conn = conn
    env.secret = {}
    env.opened = []
    env.code = 'the-code'
    try {
      await signInMcp(conn, new AbortController().signal)
      const u = new URL(env.opened[0])
      expect(`${u.origin}${u.pathname}`).toBe(`${srv.base}/authorize`)
      expect(u.searchParams.get('client_id')).toBe('cid-1')
      expect(u.searchParams.get('code_challenge_method')).toBe('S256')
      expect(u.searchParams.get('state')).toBe('state')
      expect(u.searchParams.get('resource')).toBe(`${srv.base}/mcp`)
      expect((env.secret.tokens as { access_token: string }).access_token).toBe('at-1')
    } finally {
      forgetClient(conn.id)
      await srv.close()
    }
  })
})

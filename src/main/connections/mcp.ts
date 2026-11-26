// D-54: connections of the user's own, by MCP address. A small Streamable HTTP client and the MCP sign-in flow written here, not the SDK: main must not load the SDK (its ajv). Tools are pinned when turned on, so a server can't change one that's on (DEVLOG D-54, decision 7).
import { createHash } from 'node:crypto'
import { send } from '../net'
import { maskSecrets } from '../../shared/secrets'
import { ConnectionError, LIMITS, type SavedConnection, type SavedTool } from './types'
import { savedConnection, unlockSecret, updateSecret } from './store'
import { catchRedirect, newState, openInBrowser, pkce, type Catcher } from './oauth'

const AUTH_RAN_OUT = 'This connection’s sign-in ran out. Sign in again in Settings › Connections.'
const NOT_A_CONNECTION = 'That address didn’t answer like a connection Otty can use.'
const SIGN_IN_FAILED = 'Signing in to this connection didn’t work. Try again, or choose “A key or token”.'
const PROTOCOL = '2025-06-18'
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }

export function checkAddress(input: string): URL {
  const bad = () => new ConnectionError('Use the https address the app gives you, such as https://mcp.example.com/mcp.', 'bad')
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw bad()
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw bad()
  if (url.username || url.password) throw bad()
  return url
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])]))
  }
  return value
}

export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

export function pinOf(name: string, description: string, schema: Record<string, unknown>): string {
  return createHash('sha256').update(canonical([name, description, schema])).digest('hex')
}

export function mcpToolName(connectionId: string, tool: string): string {
  return `mcp_${connectionId.replace(/^mcp-/, '').slice(0, 6)}_${tool.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 64)
}

/** "list_issues" → "List issues": a server without a title still gets words people read. */
export function plainName(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : name
}

export interface ListedTool {
  name: string
  title: string
  description: string
  schema: Record<string, unknown>
  readOnly: boolean
}

export function reconcile(saved: SavedTool[], listed: ListedTool[]): SavedTool[] {
  return listed.map(t => {
    const fields = { name: t.name, title: t.title, description: t.description, schema: t.schema, readOnly: t.readOnly }
    const pin = pinOf(t.name, t.description, t.schema)
    const old = saved.find(s => s.name === t.name)
    if (!old) return { ...fields, on: false, pin }
    if (old.pin !== pin && (old.on || old.changed)) return { ...fields, on: false, changed: true, pin: old.pin }
    if (old.pin === pin) return { ...fields, on: old.on, pin }
    return { ...fields, on: false, pin }
  })
}

export function turnOn(tool: SavedTool, on: boolean): SavedTool {
  if (!on) return { ...tool, on: false }
  const next: SavedTool = { ...tool, on: true, pin: pinOf(tool.name, tool.description, tool.schema) }
  delete next.changed
  return next
}

// ---- Client ----

interface Session {
  sessionId?: string
  protocol: string
  next: number
}

const sessions = new Map<string, Session>()

export function forgetClient(id: string): void {
  sessions.delete(id)
}

type RpcReply = { id?: unknown; result?: unknown; error?: unknown }
type Tokens = { access_token: string; refresh_token?: string; expires_at?: number; token_endpoint: string; resource: string }
type ClientInfo = { client_id: string; redirect_uris: string[]; issuer: string }
type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number }

const fresh = (c: SavedConnection): SavedConnection => savedConnection(c.id) ?? c
const tokensOf = (c: SavedConnection): Tokens | undefined => unlockSecret(fresh(c)).tokens as Tokens | undefined
const clientOf = (c: SavedConnection): ClientInfo | undefined => unlockSecret(fresh(c)).client as ClientInfo | undefined

async function okJson<T>(res: Response): Promise<T | undefined> {
  if (!res.ok) return undefined
  try {
    return (await res.json()) as T
  } catch {
    return undefined
  }
}

async function authHeader(c: SavedConnection): Promise<string | undefined> {
  if (c.auth === 'token') return `Bearer ${unlockSecret(fresh(c)).token}`
  if (c.auth === 'oauth') return `Bearer ${await accessToken(c)}`
  return undefined
}

/** One JSON-RPC call (or a notification). A 401 on an OAuth connection refreshes once and retries. */
async function rpc(c: SavedConnection, method: string, params: unknown, { notify = false }: { notify?: boolean } = {}): Promise<unknown> {
  const s = sessions.get(c.id)
  if (!s) throw new ConnectionError(NOT_A_CONNECTION, 'bad')
  const id = s.next++
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
    if (method !== 'initialize') headers['MCP-Protocol-Version'] = s.protocol
    if (s.sessionId) headers['Mcp-Session-Id'] = s.sessionId
    const auth = await authHeader(c)
    if (auth) headers.Authorization = auth
    const res = await send(checkAddress(c.url!), {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(notify ? {} : { id }) }),
      signal: AbortSignal.timeout(method === 'tools/call' ? LIMITS.callMs : LIMITS.connectMs)
    })
    if (res.status === 401) {
      if (c.auth === 'oauth' && attempt === 0) {
        await refresh(c)
        continue
      }
      throw new ConnectionError(AUTH_RAN_OUT, 'auth')
    }
    if (!res.ok) {
      if (res.status === 404 && s.sessionId) forgetClient(c.id)
      throw new ConnectionError(NOT_A_CONNECTION, 'bad')
    }
    const sid = res.headers.get('mcp-session-id')
    if (sid) s.sessionId = sid
    if (notify) return undefined
    const type = res.headers.get('content-type') ?? ''
    let reply: RpcReply | undefined
    if (type.includes('application/json')) reply = (await res.json()) as RpcReply
    else if (type.includes('text/event-stream')) reply = eventReply(await res.text(), id)
    if (!reply || reply.error !== undefined) throw new ConnectionError(NOT_A_CONNECTION, 'bad')
    return reply.result
  }
}

/** The reply to request `id` among the server-sent events, each event's data lines joined. */
function eventReply(text: string, id: number): RpcReply | undefined {
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (!data) continue
    const msg = JSON.parse(data) as RpcReply
    if (msg.id === id) return msg
  }
  return undefined
}

async function session(c: SavedConnection): Promise<void> {
  if (sessions.has(c.id)) return
  sessions.set(c.id, { protocol: PROTOCOL, next: 1 })
  const init = (await rpc(c, 'initialize', {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: 'Otty', version: '1' }
  })) as { protocolVersion?: unknown } | undefined
  const s = sessions.get(c.id)
  if (s && typeof init?.protocolVersion === 'string') s.protocol = init.protocolVersion
  await rpc(c, 'notifications/initialized', {}, { notify: true })
}

const codeOf = (e: unknown): string | undefined => (e as { code?: unknown } | undefined)?.code as string | undefined

function mapError(c: SavedConnection, err: unknown): Error {
  if (err instanceof ConnectionError) return err
  const e = err as Error | undefined
  if (String(e?.message ?? '').includes('401')) return new ConnectionError(AUTH_RAN_OUT, 'auth')
  const cause = (err as { cause?: unknown })?.cause
  const network =
    err instanceof TypeError ||
    e?.name === 'AbortError' ||
    ['ECONNREFUSED', 'ENOTFOUND'].includes(codeOf(err) ?? '') ||
    ['ECONNREFUSED', 'ENOTFOUND'].includes(codeOf(cause) ?? '')
  if (network) {
    let host = 'the address'
    try {
      host = new URL(c.url ?? '').hostname
    } catch {
      /* keep the generic word */
    }
    return new ConnectionError(`Otty can’t reach ${host}. Check the address and your connection.`, 'network')
  }
  return new ConnectionError(NOT_A_CONNECTION, 'bad')
}

async function withClient<T>(c: SavedConnection, run: () => Promise<T>): Promise<T> {
  try {
    await session(c)
    return await run()
  } catch (err) {
    forgetClient(c.id)
    console.warn('MCP request failed', (err as Error)?.name)
    throw mapError(c, err)
  }
}

type RawTool = {
  name: string
  title?: string
  description?: string
  inputSchema: Record<string, unknown>
  annotations?: { title?: string; readOnlyHint?: boolean }
}

export async function listTools(c: SavedConnection): Promise<ListedTool[]> {
  return withClient(c, async () => {
    const out: ListedTool[] = []
    let cursor: string | undefined
    for (let page = 0; page < 5 && out.length < 100; page++) {
      const r = (await rpc(c, 'tools/list', cursor ? { cursor } : {})) as { tools?: RawTool[]; nextCursor?: string }
      for (const tool of r.tools ?? []) {
        if (out.length >= 100) break
        out.push({
          name: tool.name,
          title: tool.title ?? tool.annotations?.title ?? plainName(tool.name),
          description: maskSecrets((tool.description ?? '').slice(0, 1000)).text,
          schema: tool.inputSchema,
          readOnly: tool.annotations?.readOnlyHint === true
        })
      }
      cursor = r.nextCursor
      if (!cursor) break
    }
    return out
  })
}

export async function callTool(
  c: SavedConnection,
  tool: string,
  args: Record<string, unknown>
): Promise<{ text: string; isError: boolean }> {
  return withClient(c, async () => {
    const result = (await rpc(c, 'tools/call', { name: tool, arguments: args })) as {
      content?: Array<Record<string, unknown>>
      structuredContent?: unknown
      isError?: boolean
    }
    const content = result.content ?? []
    let text = content
      .map(item => {
        switch (item.type) {
          case 'text':
            return typeof item.text === 'string' ? item.text : ''
          case 'image':
            return '[a picture]'
          case 'audio':
            return '[a sound]'
          case 'resource': {
            const r = item.resource as { text?: unknown } | undefined
            return typeof r?.text === 'string' ? r.text : ''
          }
          case 'resource_link':
            return `[${String(item.name)}](${String(item.uri)})`
          default:
            return ''
        }
      })
      .join('\n\n')
    if (!text && result.structuredContent) text = JSON.stringify(result.structuredContent)
    const masked = maskSecrets(text).text
    const cut = masked.length > LIMITS.mcpChars ? `${masked.slice(0, LIMITS.mcpChars)}\n…` : masked
    return { text: cut, isError: Boolean(result.isError) }
  })
}

// ---- OAuth (MCP authorization, written here) ----

function accessTokenExpiring(t: Tokens): boolean {
  return t.expires_at !== undefined && t.expires_at - Date.now() < 60_000
}

async function accessToken(c: SavedConnection): Promise<string> {
  let t = tokensOf(c)
  if (!t) throw new ConnectionError(AUTH_RAN_OUT, 'auth')
  if (accessTokenExpiring(t)) {
    await refresh(c)
    t = tokensOf(c)
    if (!t) throw new ConnectionError(AUTH_RAN_OUT, 'auth')
  }
  return t.access_token
}

async function refresh(c: SavedConnection): Promise<void> {
  const t = tokensOf(c)
  if (!t?.refresh_token) throw new ConnectionError(AUTH_RAN_OUT, 'auth')
  const res = await send(t.token_endpoint, {
    method: 'POST',
    headers: FORM,
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
      client_id: clientOf(c)?.client_id ?? '',
      resource: t.resource
    }),
    signal: AbortSignal.timeout(LIMITS.connectMs)
  })
  const reply = await okJson<TokenReply>(res)
  const access = reply?.access_token
  if (!access) throw new ConnectionError(AUTH_RAN_OUT, 'auth')
  const expires = reply?.expires_in
  updateSecret(c.id, s => ({
    ...s,
    tokens: {
      ...t,
      access_token: access,
      refresh_token: reply?.refresh_token ?? t.refresh_token,
      expires_at: expires ? Date.now() + expires * 1000 : undefined
    }
  }))
}

interface Discovered {
  issuer: string
  authorize: string
  token: string
  register?: string
  scopes?: string[]
}

async function fetchJson<T>(url: string): Promise<T | undefined> {
  return okJson<T>(await send(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(LIMITS.connectMs) }))
}

async function discover(server: URL): Promise<Discovered> {
  const init = await send(server, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'Otty', version: '1' } }
    }),
    signal: AbortSignal.timeout(LIMITS.connectMs)
  })
  const challenge = init.status === 401 ? (init.headers.get('www-authenticate') ?? '') : ''
  const advertised = /resource_metadata="([^"]+)"/.exec(challenge)?.[1]
  const candidates = [
    advertised,
    `${server.origin}/.well-known/oauth-protected-resource${server.pathname}`,
    `${server.origin}/.well-known/oauth-protected-resource`
  ].filter((u): u is string => Boolean(u))
  let resource: { authorization_servers?: string[]; scopes_supported?: string[] } | undefined
  for (const url of candidates) {
    resource = await fetchJson(url)
    if (resource) break
  }
  const issuer = new URL(resource?.authorization_servers?.[0] ?? server.origin)
  const O = issuer.origin
  const P = issuer.pathname === '/' ? '' : issuer.pathname
  const asCandidates = [
    `${O}/.well-known/oauth-authorization-server${P}`,
    `${O}/.well-known/openid-configuration${P}`,
    `${O}${P}/.well-known/openid-configuration`
  ]
  for (const url of asCandidates) {
    const m = await fetchJson<{ authorization_endpoint?: string; token_endpoint?: string; registration_endpoint?: string }>(url)
    if (m?.authorization_endpoint && m.token_endpoint) {
      return {
        issuer: issuer.href,
        authorize: m.authorization_endpoint,
        token: m.token_endpoint,
        register: m.registration_endpoint,
        scopes: resource?.scopes_supported
      }
    }
  }
  throw new ConnectionError(SIGN_IN_FAILED, 'auth')
}

/** The client Otty is registered as for this server and this exact redirect address, registering once if needed. */
async function clientFor(c: SavedConnection, meta: Discovered, redirectUri: string): Promise<ClientInfo> {
  const saved = clientOf(c)
  if (saved && saved.issuer === meta.issuer && Array.isArray(saved.redirect_uris) && saved.redirect_uris.includes(redirectUri)) return saved
  if (!meta.register) throw new ConnectionError(SIGN_IN_FAILED, 'auth')
  const res = await send(meta.register, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Otty',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    }),
    signal: AbortSignal.timeout(LIMITS.connectMs)
  })
  const reg = await okJson<{ client_id?: string }>(res)
  if (!reg?.client_id) throw new ConnectionError(SIGN_IN_FAILED, 'auth')
  const client: ClientInfo = { client_id: reg.client_id, redirect_uris: [redirectUri], issuer: meta.issuer }
  updateSecret(c.id, s => ({ ...s, client }))
  return client
}

export async function signInMcp(c: SavedConnection, signal: AbortSignal): Promise<void> {
  forgetClient(c.id)
  let catcher: Catcher | undefined
  try {
    const server = checkAddress(c.url!)
    const meta = await discover(server)
    const state = newState()
    catcher = await catchRedirect({ state, signal })
    const client = await clientFor(c, meta, catcher.redirectUri)
    const { verifier, challenge } = pkce()
    const url = new URL(meta.authorize)
    const params: Record<string, string> = {
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: catcher.redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      resource: server.href
    }
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    if (meta.scopes?.length) url.searchParams.set('scope', meta.scopes.join(' '))
    await openInBrowser(url.href)
    const code = await catcher.code
    const reply = await okJson<TokenReply>(
      await send(meta.token, {
        method: 'POST',
        headers: FORM,
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: catcher.redirectUri,
          client_id: client.client_id,
          code_verifier: verifier,
          resource: server.href
        }),
        signal: AbortSignal.timeout(LIMITS.connectMs)
      })
    )
    const access = reply?.access_token
    if (!access) throw new ConnectionError(SIGN_IN_FAILED, 'auth')
    const expires = reply?.expires_in
    const tokens: Tokens = {
      access_token: access,
      refresh_token: reply?.refresh_token,
      expires_at: expires ? Date.now() + expires * 1000 : undefined,
      token_endpoint: meta.token,
      resource: server.href
    }
    updateSecret(c.id, s => ({ ...s, tokens }))
  } catch (err) {
    if (err instanceof ConnectionError) throw err
    throw new ConnectionError(SIGN_IN_FAILED, 'auth')
  } finally {
    catcher?.close()
  }
}

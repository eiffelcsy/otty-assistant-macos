// D-54: connecting, checking and disconnecting, and what windows see. Windows get views, never secrets.
import { serviceAt, serviceById } from '../../shared/services'
import type { ConnectionKind, ConnectionOffer, ConnectionsState, ConnectionToolView, ConnectionView, ConnectRequest, ConnectResult } from '../../shared/types'
import { getStored } from '../settings'
import { webOff } from '../tools'
import { appleAccess } from './apple'
import { canvasOrigin, checkCanvas } from './canvas'
import { googleClient, revokeGoogle, signInGoogle } from './google'
import { checkAddress, forgetClient, listTools, reconcile, signInMcp, turnOn, type ListedTool } from './mcp'
import { checkNotion } from './notion'
import { dropConnection, lockSecret, markExpired, newOwnId, putConnection, savedConnection, savedConnections, unlockSecret } from './store'
import { ConnectionError, KIND_LABEL, type SavedConnection } from './types'

let pending: AbortController | null = null

/** A new sign-in in the browser; an older one still waiting is cancelled. */
function begin(): AbortSignal {
  pending?.abort()
  pending = new AbortController()
  return pending.signal
}

function end(): void {
  pending = null
}

const providerLabel = (): string => serviceById(serviceAt(getStored().baseUrl)).label

const ONLINE: ConnectionKind[] = ['google', 'canvas', 'notion', 'mcp']
const OFF_WORDS = 'Off while Otty uses a model on this Mac.'

/** What a window sees of one connection. Never a token. */
export function viewOf(c: SavedConnection): ConnectionView {
  const tools = c.tools ?? []
  const status: ConnectionView['status'] = c.expired
    ? 'needs-sign-in'
    : tools.some((t) => t.changed)
      ? 'changed'
      : ONLINE.includes(c.kind) && webOff()
        ? 'off'
        : 'on'
  // Only Canvas and the user's own have an address of their own.
  const host = c.kind === 'google' ? 'www.googleapis.com' : c.kind === 'notion' ? 'api.notion.com' : c.url ? new URL(c.url).host : ''
  const reads: Record<ConnectionKind, string> = {
    apple: 'Reads your calendars and reminders on this Mac',
    google: 'Reads your Google calendars',
    canvas: `Reads what’s due and announcements at ${host}`,
    notion: 'Reads pages you’ve shared with Otty',
    mcp: `${tools.filter((t) => t.on).length} of ${tools.length} tools on · ${host}`
  }
  const privacy = c.kind === 'apple' && webOff() ? 'Stays on this Mac.' : `What Otty reads goes to ${providerLabel()} with your question, and shows in What left your Mac.`
  const toolViews: ConnectionToolView[] = c.kind === 'mcp'
    ? tools.map((t) => ({ name: t.name, title: t.title, description: t.description, on: t.on, readOnly: t.readOnly, changed: Boolean(t.changed) }))
    : []
  return { id: c.id, kind: c.kind, label: c.label, host, status, reads: reads[c.kind], privacy, tools: toolViews }
}

export function connectionsState(): ConnectionsState {
  const saved = savedConnections()
  const have = new Set(saved.map((c) => c.kind))
  const offers: ConnectionOffer[] = (['apple', 'google', 'canvas', 'notion'] as const)
    .filter((kind) => !have.has(kind))
    .map((kind) => {
      if (kind === 'google' && !googleClient()) return { kind, available: false, why: 'Not set up in this build.' }
      if (kind !== 'apple' && webOff()) return { kind, available: false, why: OFF_WORDS }
      return { kind, available: true }
    })
  return { connected: saved.map(viewOf), offers, online: !webOff() }
}

function done(id: string, message: string): ConnectResult {
  return { ok: true, message, view: viewOf(savedConnection(id)!) }
}

function unexpired(c: SavedConnection): SavedConnection {
  const { expired: _old, ...rest } = c
  return rest
}

/** Turns any failure into words for the form. Nothing else leaves a connect call. */
async function guarded(fn: () => Promise<ConnectResult>): Promise<ConnectResult> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ConnectionError) return { ok: false, message: err.message }
    console.warn('Connecting failed', (err as Error).name)
    return { ok: false, message: 'Something went wrong connecting. Try again.' }
  } finally {
    end()
  }
}

async function connectNow(req: ConnectRequest): Promise<ConnectResult> {
  if (ONLINE.includes(req.kind) && webOff()) return { ok: false, message: OFF_WORDS }
  const added = Date.now()
  switch (req.kind) {
    case 'apple': {
      if (!(await appleAccess())) throw new ConnectionError('Otty isn’t allowed to read your calendars. Turn it on in System Settings › Privacy & Security › Calendars.', 'denied')
      putConnection({ id: 'apple', kind: 'apple', label: KIND_LABEL.apple, auth: 'none', added })
      return done('apple', 'Connected. Ask “what’s on tomorrow?” to try it.')
    }
    case 'google': {
      const secret = await signInGoogle(begin())
      putConnection({ id: 'google', kind: 'google', label: KIND_LABEL.google, auth: 'oauth', secret: lockSecret(secret), added })
      return done('google', 'Connected. Ask “what’s on tomorrow?” to try it.')
    }
    case 'canvas': {
      const origin = canvasOrigin(req.url)
      const token = req.token.trim()
      const name = await checkCanvas(origin, token)
      putConnection({ id: 'canvas', kind: 'canvas', label: 'Canvas', url: origin, auth: 'token', secret: lockSecret({ token }), added })
      return done('canvas', `Connected as ${name}. Ask “what’s due this week?” to try it.`)
    }
    case 'notion': {
      const token = req.token.trim()
      const name = await checkNotion(token)
      putConnection({ id: 'notion', kind: 'notion', label: 'Notion', auth: 'token', secret: lockSecret({ token }), added })
      return done('notion', `Connected to ${name}. Ask about a page you’ve shared with Otty.`)
    }
    case 'mcp': {
      const url = checkAddress(req.url).href
      const id = newOwnId()
      const label = req.name.trim().slice(0, 40) || new URL(url).host
      const base: SavedConnection = { id, kind: 'mcp', label, url, auth: req.auth, tools: [], added }
      try {
        if (req.auth === 'token') {
          const token = req.token?.trim()
          if (!token) throw new ConnectionError('Paste the key or token first.', 'bad')
          putConnection({ ...base, secret: lockSecret({ token }) })
        } else if (req.auth === 'oauth') {
          putConnection(base)
          await signInMcp(base, begin())
        } else putConnection(base)
        const tools = reconcile([], await listTools(savedConnection(id) ?? base))
        putConnection({ ...(savedConnection(id) ?? base), tools })
      } catch (err) {
        dropConnection(id)
        forgetClient(id)
        throw err
      }
      return done(id, 'Added. Turn on the tools you want Otty to use.')
    }
  }
}

export function connect(req: ConnectRequest): Promise<ConnectResult> {
  return guarded(() => connectNow(req))
}

export function cancelConnect(): void {
  pending?.abort()
}

/** Turns one of the user's own tools on or off. Turning on pins the copy the server listed now (decision 7). */
export async function setTool(id: string, tool: string, on: boolean): Promise<ConnectResult> {
  const c = savedConnection(id)
  if (!c || c.kind !== 'mcp') return { ok: false, message: 'That connection is gone.' }
  const tools = (c.tools ?? []).map((t) => (t.name === tool ? turnOn(t, on) : t))
  putConnection({ ...c, tools })
  return { ok: true, message: '', view: viewOf(savedConnection(id)!) }
}

async function recheckNow(id: string): Promise<ConnectResult> {
  const c = savedConnection(id)
  if (!c || c.kind !== 'mcp') throw new ConnectionError('That connection is gone.', 'bad')
  let listed: ListedTool[]
  try {
    listed = await listTools(c)
  } catch (err) {
    if (err instanceof ConnectionError && err.kind === 'auth') markExpired(id)
    throw err
  }
  const old = c.tools ?? []
  const tools = reconcile(old, listed)
  putConnection({ ...unexpired(c), tools })
  const n = tools.filter((t) => t.changed && !old.find((o) => o.name === t.name)?.changed).length
  const message = n ? `${n} ${n === 1 ? 'tool' : 'tools'} changed since you turned them on, so they’re off until you check them.` : 'Up to date.'
  return { ok: true, message, view: viewOf(savedConnection(id)!) }
}

export function recheck(id: string): Promise<ConnectResult> {
  return guarded(() => recheckNow(id))
}

async function signInAgainNow(id: string): Promise<ConnectResult> {
  const c = savedConnection(id)
  if (c?.kind === 'google') {
    const secret = await signInGoogle(begin())
    putConnection({ ...unexpired(c), secret: lockSecret(secret) })
    return { ok: true, message: 'Signed in again.', view: viewOf(savedConnection(id)!) }
  }
  if (c?.kind === 'mcp' && c.auth === 'oauth') {
    await signInMcp(c, begin())
    markExpired(id, false)
    return recheckNow(id)
  }
  return { ok: false, message: 'Disconnect it, then connect it again with a new key.' }
}

export function signInAgain(id: string): Promise<ConnectResult> {
  return guarded(() => signInAgainNow(id))
}

export async function removeConnection(id: string): Promise<ConnectionsState> {
  const c = savedConnection(id)
  if (c?.kind === 'google') {
    try {
      await revokeGoogle(unlockSecret(c))
    } catch (err) {
      console.warn('Could not revoke the Google sign-in', (err as Error).name)
    }
  }
  if (c?.kind === 'mcp') forgetClient(id)
  dropConnection(id)
  return connectionsState()
}

/** Checks every connection of the user's own again, one after another, at launch (and from Check again). */
export async function refreshAll(): Promise<void> {
  if (webOff()) return
  for (const c of savedConnections()) if (c.kind === 'mcp') await recheck(c.id)
}

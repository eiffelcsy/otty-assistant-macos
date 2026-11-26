// D-54: Google Calendar, read read-only after a sign-in in the browser (PKCE). Tokens go back through `save`, never out.
import { send } from '../net'
import { maskSecrets } from '../../shared/secrets'
import { ConnectionError, LIMITS, type CalendarEvent, type Secret } from './types'
import { catchRedirect, newState, openInBrowser, pkce } from './oauth'

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const TOKEN = 'https://oauth2.googleapis.com/token'
const AUTH = 'Google’s sign-in ran out. Sign in again.'
const SETUP = 'Google sign-in isn’t set up in this build.'

/** The app's Google client, from the build's environment. Null when this build has none. */
export function googleClient(): { id: string; secret: string } | null {
  const id = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID
  const secret = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? ''
  return id ? { id, secret } : null
}

/** `authOn` lists the statuses that mean the sign-in ran out (the token endpoint answers 400 for that). */
async function getJson(url: string, init: RequestInit = {}, authOn: number[] = [401, 403]): Promise<any> {
  let res: Response
  try {
    res = await send(url, { ...init, signal: AbortSignal.timeout(LIMITS.connectMs) })
  } catch {
    throw new ConnectionError(`Otty can’t reach ${new URL(url).hostname}. Check the address and your connection.`, 'network')
  }
  if (authOn.includes(res.status)) throw new ConnectionError(AUTH, 'auth')
  if (!res.ok) throw new ConnectionError(`Google didn’t answer as expected (error ${res.status}). Try again later.`, 'bad')
  return res.json().catch(() => {
    throw new ConnectionError('Google didn’t answer as expected (error 200). Try again later.', 'bad')
  })
}

const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields)
})

/** Signs in in the browser and returns the tokens. Rejects when the user cancels (`signal`). */
export async function signInGoogle(signal: AbortSignal): Promise<Secret> {
  const client = googleClient()
  if (!client) throw new ConnectionError(SETUP, 'bad')
  const { verifier, challenge } = pkce()
  const state = newState()
  const catcher = await catchRedirect({ state, signal })
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: client.id,
      redirect_uri: catcher.redirectUri,
      response_type: 'code',
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      prompt: 'consent'
    })
  try {
    await openInBrowser(url)
  } catch (err) {
    catcher.close()
    throw err
  }
  const code = await catcher.code
  const data = await getJson(
    TOKEN,
    form({
      code,
      client_id: client.id,
      ...(client.secret ? { client_secret: client.secret } : {}),
      redirect_uri: catcher.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier
    }),
    [400, 401, 403]
  )
  if (typeof data?.access_token !== 'string') {
    throw new ConnectionError('Google didn’t finish signing you in. Try again.', 'auth')
  }
  return {
    token: data.access_token,
    refresh: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000
  }
}

/** A token good for at least a minute, refreshed when it isn't. `save` keeps the new one. */
export async function googleToken(secret: Secret, save: (s: Secret) => void): Promise<string> {
  if (secret.token && (secret.expiresAt ?? 0) > Date.now() + 60_000) return secret.token
  if (!secret.refresh) throw new ConnectionError(AUTH, 'auth')
  const client = googleClient()
  if (!client) throw new ConnectionError(SETUP, 'bad')
  const data = await getJson(
    TOKEN,
    form({
      grant_type: 'refresh_token',
      refresh_token: secret.refresh,
      client_id: client.id,
      ...(client.secret ? { client_secret: client.secret } : {})
    }),
    [400, 401]
  )
  if (typeof data?.access_token !== 'string') throw new ConnectionError(AUTH, 'auth')
  const next: Secret = {
    ...secret,
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    refresh: data.refresh_token ?? secret.refresh
  }
  save(next)
  return data.access_token
}

const clean = (value: unknown, max: number): string =>
  maskSecrets(typeof value === 'string' ? value : '').text.slice(0, max).trim()

const API = 'https://www.googleapis.com/calendar/v3'

/** Events from the user's calendars (up to ten) between `from` and `to` (epoch ms). No attendees, notes or organiser. */
export async function googleEvents(token: string, from: number, to: number): Promise<CalendarEvent[]> {
  const auth = { headers: { Authorization: `Bearer ${token}` } }
  const list = await getJson(`${API}/users/me/calendarList?minAccessRole=reader`, auth)
  const calendars: any[] = (Array.isArray(list?.items) ? list.items : []).filter((c: any) => c?.selected !== false).slice(0, 10)
  const out: CalendarEvent[] = []
  for (const cal of calendars) {
    const q = new URLSearchParams({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50'
    })
    const data = await getJson(`${API}/calendars/${encodeURIComponent(cal.id)}/events?${q}`, auth)
    const calendar = clean(cal.summaryOverride ?? cal.summary, 100)
    for (const e of Array.isArray(data?.items) ? data.items : []) {
      if (e?.status === 'cancelled' || !e?.start || !e?.end) continue
      const allDay = Boolean(e.start.date)
      out.push({
        title: clean(e.summary, 200) || '(No title)',
        allDay,
        start: Date.parse(e.start.dateTime ?? `${e.start.date}T00:00:00`),
        end: Date.parse(e.end.dateTime ?? `${e.end.date}T00:00:00`),
        ...(e.location ? { location: clean(e.location, 200) } : {}),
        calendar,
        source: 'Google Calendar'
      })
    }
  }
  return out
}

/** Revokes the sign-in at Google. Never throws: a failed revoke is only logged. */
export async function revokeGoogle(secret: Secret): Promise<void> {
  const token = secret.refresh ?? secret.token
  if (!token) return
  try {
    const res = await send(
      'https://oauth2.googleapis.com/revoke',
      { ...form({ token }), signal: AbortSignal.timeout(LIMITS.connectMs) }
    )
    if (!res.ok) throw new Error(`status ${res.status}`)
  } catch {
    console.warn('Could not revoke the Google sign-in')
  }
}

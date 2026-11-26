// D-54: Google sign-in, token refresh, event mapping and revoke.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { send } from '../../net'
import { openInBrowser, catchRedirect } from '../oauth'
import { googleEvents, googleToken, revokeGoogle, signInGoogle } from '../google'

vi.mock('../../net', () => ({ send: vi.fn() }))
vi.mock('../oauth', () => ({
  pkce: () => ({ verifier: 'VERIFIER', challenge: 'CHALLENGE' }),
  newState: () => 'STATE',
  openInBrowser: vi.fn(async () => {}),
  catchRedirect: vi.fn(async () => ({ redirectUri: 'http://127.0.0.1:5000/cb', code: Promise.resolve('abc'), close: vi.fn() }))
}))
const sendMock = vi.mocked(send)
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  sendMock.mockReset()
  vi.stubEnv('MAIN_VITE_GOOGLE_CLIENT_ID', 'client-id')
  vi.stubEnv('MAIN_VITE_GOOGLE_CLIENT_SECRET', '')
})

describe('googleToken', () => {
  it('returns a fresh token without a request', async () => {
    const token = await googleToken({ token: 'fresh', expiresAt: Date.now() + 3_600_000 }, vi.fn())
    expect(token).toBe('fresh')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('refreshes when expired and saves the new token', async () => {
    sendMock.mockResolvedValueOnce(reply({ access_token: 'new', expires_in: 3600 }))
    const save = vi.fn()
    const token = await googleToken({ token: 'old', refresh: 'r1', expiresAt: 0 }, save)
    expect(token).toBe('new')
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ token: 'new', refresh: 'r1' }))
  })

  it('a refused refresh is an auth error', async () => {
    sendMock.mockResolvedValueOnce(reply({ error: 'invalid_grant' }, 400))
    await expect(googleToken({ refresh: 'r1' }, vi.fn())).rejects.toMatchObject({ kind: 'auth' })
  })
})

describe('signInGoogle', () => {
  it('sends the verifier and the redirect uri in the token exchange', async () => {
    sendMock.mockResolvedValueOnce(reply({ access_token: 'at', refresh_token: 'rt', expires_in: 3599 }))
    const secret = await signInGoogle(new AbortController().signal)
    expect(secret.token).toBe('at')
    expect(secret.refresh).toBe('rt')
    expect(openInBrowser).toHaveBeenCalledWith(expect.stringContaining('code_challenge=CHALLENGE'))
    const body = ((sendMock.mock.calls[0][1] as RequestInit).body as URLSearchParams).toString()
    expect(body).toContain('code_verifier=VERIFIER')
    expect(body).toContain('redirect_uri=' + encodeURIComponent('http://127.0.0.1:5000/cb'))
    expect(catchRedirect).toHaveBeenCalled()
  })
})

describe('googleEvents', () => {
  it('maps events without attendees or notes, all-day at local midnight', async () => {
    sendMock
      .mockResolvedValueOnce(reply({ items: [{ id: 'me@x', summary: 'Me' }] }))
      .mockResolvedValueOnce(
        reply({
          items: [
            { summary: 'Talk', start: { dateTime: '2026-12-01T10:00:00' }, end: { dateTime: '2026-12-01T11:00:00' }, location: 'Room 1', attendees: [{ email: 'a@b' }], description: 'secret notes' },
            { summary: 'Holiday', start: { date: '2026-12-02' }, end: { date: '2026-12-03' } },
            { summary: 'Gone', status: 'cancelled', start: { date: '2026-12-02' }, end: { date: '2026-12-03' } }
          ]
        })
      )
    const events = await googleEvents('tok', 0, 1)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({
      title: 'Talk',
      allDay: false,
      start: Date.parse('2026-12-01T10:00:00'),
      end: Date.parse('2026-12-01T11:00:00'),
      location: 'Room 1',
      calendar: 'Me',
      source: 'Google Calendar'
    })
    expect(events[1]).toMatchObject({ title: 'Holiday', allDay: true, start: Date.parse('2026-12-02T00:00:00') })
    expect(JSON.stringify(events)).not.toContain('secret notes')
  })
})

describe('revokeGoogle', () => {
  it('swallows errors', async () => {
    sendMock.mockRejectedValueOnce(new Error('offline'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(revokeGoogle({ refresh: 'r' })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

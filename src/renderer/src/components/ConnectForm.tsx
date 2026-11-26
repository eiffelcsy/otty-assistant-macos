import { useRef, useState } from 'react'
import type { ConnectionDraft, ConnectionKind, ConnectionView, ConnectRequest, ConnectResult, McpAuth } from '../../../shared/types'
import { Icon } from './Icon'

// The form that connects one service (D-54, docs/design/specs/10-connections.md, Part 3). Shared by Settings and the
// chat's connection card. Main checks everything; this only asks for it, and keeps what was typed after a failure
// except the token, which is cleared after every try.

const APPLE_REFUSED = 'Otty isn’t allowed to read your calendars. Turn it on in System Settings › Privacy & Security › Calendars.'

const AUTH: { value: McpAuth; label: string }[] = [
  { value: 'none', label: 'No sign-in' },
  { value: 'token', label: 'A key or token' },
  { value: 'oauth', label: 'Sign in in the browser' }
]

/** The address with https:// added when it has no scheme. */
const withScheme = (url: string) => (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)

export function ConnectForm({ kind, draft, onDone }: { kind: ConnectionKind; draft?: ConnectionDraft; onDone: (view: ConnectionView, message: string) => void }) {
  const mcp = draft?.kind === 'mcp' ? draft : undefined
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')
  const [name, setName] = useState(mcp?.name ?? '')
  const [url, setUrl] = useState(mcp?.url ?? '')
  const [auth, setAuth] = useState<McpAuth>(mcp?.auth ?? 'oauth')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  /** Cancel was pressed while the browser sign-in was waiting: its late answer is ignored. */
  const cancelled = useRef(false)

  const browser = busy && (kind === 'google' || (kind === 'mcp' && auth === 'oauth'))
  const needsToken = auth === 'token'

  const ready =
    kind === 'canvas' ? Boolean(address.trim() && token.trim()) : kind === 'notion' ? Boolean(token.trim()) : kind === 'mcp' ? Boolean(name.trim() && url.trim() && (!needsToken || token.trim())) : true

  const connect = async (req: ConnectRequest) => {
    cancelled.current = false
    setBusy(true)
    setError(null)
    setRefused(false)
    const r = await window.otty.connect(req).catch((): ConnectResult => ({ ok: false, message: 'Couldn’t connect. Try again.' }))
    setBusy(false)
    setToken('')
    if (cancelled.current) return
    if (r.ok && r.view) return onDone(r.view, r.message)
    if (kind === 'apple') setRefused(true)
    setError(kind === 'apple' && !r.ok ? APPLE_REFUSED : r.message)
  }

  const submit = () => {
    if (kind === 'apple') return void connect({ kind: 'apple' })
    if (kind === 'google') return void connect({ kind: 'google' })
    if (kind === 'canvas') return void connect({ kind: 'canvas', url: withScheme(address), token: token.trim() })
    if (kind === 'notion') return void connect({ kind: 'notion', token: token.trim() })
    void connect({ kind: 'mcp', name: name.trim(), url: url.trim(), auth, ...(needsToken ? { token: token.trim() } : {}) })
  }

  const cancel = () => {
    cancelled.current = true
    setBusy(false)
    void window.otty.cancelConnect()
  }

  const label = kind === 'apple' ? 'Allow access' : kind === 'google' ? 'Sign in with Google' : kind === 'mcp' ? 'Check and add' : 'Check and connect'

  return (
    <div className="connection connect-form">
      {kind === 'apple' && <p className="hint">macOS will ask you to allow Otty.</p>}

      {kind === 'canvas' && (
        <>
          <label className="label">
            Your school’s Canvas address
            <input className="field" value={address} placeholder="canvas.nus.edu.sg" onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="label">
            Token
            <input className="field" type="password" value={token} placeholder="Paste it here" onChange={(e) => setToken(e.target.value)} />
          </label>
          <p className="hint">In Canvas: Account › Settings › New access token.</p>
        </>
      )}

      {kind === 'notion' && (
        <>
          <label className="label">
            Token
            <input className="field" type="password" value={token} placeholder="ntn_…" onChange={(e) => setToken(e.target.value)} />
          </label>
          <p className="hint">At notion.so/my-integrations, make an integration, copy its secret, then share pages with it.</p>
        </>
      )}

      {kind === 'mcp' && (
        <>
          <label className="label">
            Name
            <input className="field" value={name} maxLength={40} placeholder="Linear" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="label">
            Address
            <input className="field" value={url} placeholder="https://mcp.example.com/mcp" onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="label">
            How it signs in
            <span className="popup">
              <select aria-label="How it signs in" value={auth} onChange={(e) => setAuth(e.target.value as McpAuth)}>
                {AUTH.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <Icon name="angle-small-down" />
            </span>
          </label>
          {needsToken && (
            <label className="label">
              Key or token
              <input className="field" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
            </label>
          )}
        </>
      )}

      {browser ? (
        <div className="connect-form__waiting">
          <span className="connect-form__status">
            <Icon name="spinner" /> Finish signing in in your browser…
          </span>
          <button className="btn btn--soft btn--small" onClick={cancel}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn btn--primary" disabled={busy || !ready} onClick={submit}>
          {busy ? 'Checking…' : label}
        </button>
      )}

      {error && <div className="error-card">{error}</div>}
      {refused && (
        <button className="link-btn" onClick={() => void window.otty.openPermissionSettings('calendars')}>
          Open System Settings <Icon name="arrow-up-right-from-square" />
        </button>
      )}
    </div>
  )
}

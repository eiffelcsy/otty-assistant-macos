import { useState } from 'react'
import type { ConnectionKind, ConnectionOffer, ConnectionsState, ConnectionToolView, ConnectionView, ConnectResult } from '../../../../shared/types'
import { ConnectForm } from '../../components/ConnectForm'
import { Icon } from '../../components/Icon'
import { Group, HoldButton, SwitchRow } from './rows'

// Settings › Connections (D-54, docs/design/specs/10-connections.md, Part 2). One list of what Otty can read, one open
// item at a time, and the off switch in plain view. Every action goes through main and then refreshes the list.

const GLYPH: Record<ConnectionKind, string> = { apple: 'brand-apple', google: 'brand-google', canvas: 'brand-canvas', notion: 'brand-notion', mcp: 'puzzle-alt' }

/** The add-group rows: the words under each, from the spec. */
const OFFER: Record<ConnectionOffer['kind'], { title: string; description: string }> = {
  apple: { title: 'Apple Calendar and Reminders', description: 'Your Mac’s calendars, including Google ones you’ve added to Calendar. Stays on this Mac.' },
  google: { title: 'Google Calendar', description: 'Sign in with Google. Otty can read your calendars, never change them.' },
  canvas: { title: 'Canvas', description: 'Paste a token from your Canvas profile. Otty can read what’s due and announcements.' },
  notion: { title: 'Notion', description: 'Paste a token from an integration you made. Otty sees only pages you share with it.' }
}
const OWN = 'Your own connection'
const OWN_DESCRIPTION = 'Any app with a connection address (MCP). Its help pages give you the address.'
const OFF = 'Off while Otty uses a model on this Mac.'

const toolTitle = (t: ConnectionToolView) => t.title || (t.name.replace(/_/g, ' ').charAt(0).toUpperCase() + t.name.replace(/_/g, ' ').slice(1))

function Tool({ tool, onChange }: { tool: ConnectionToolView; onChange: (on: boolean) => void }) {
  const description = tool.changed ? (
    <span className="hint--warn">Changed since you turned it on. Check what it does before turning it on again.</span>
  ) : (
    <>
      <span className="set-tool__desc" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {tool.description}
      </span>
      {!tool.readOnly && <span className="hint"> Asks first</span>}
    </>
  )
  return <SwitchRow title={toolTitle(tool)} description={description} on={tool.on && !tool.changed} onChange={onChange} />
}

/** One connected service: its privacy line, its tools (own only), and its buttons. */
function Detail({ view, onState, fail, say, busy, setBusy, onRemoved }: { view: ConnectionView; onState: (s: ConnectionsState) => void; fail: (message: string) => void; say: (message: string) => void; busy: boolean; setBusy: (b: boolean) => void; onRemoved: () => void }) {
  const run = async (action: () => Promise<ConnectResult>) => {
    setBusy(true)
    fail('')
    say('')
    const r = await action().catch((): ConnectResult => ({ ok: false, message: 'Something went wrong. Try again.' }))
    setBusy(false)
    if (!r.ok) fail(r.message)
    else if (r.message) say(r.message)
    onState(await window.otty.connections())
  }
  return (
    <div className="set-conn">
      <p className="hint">{view.privacy}</p>
      {view.kind === 'mcp' && (
        <Group label="What Otty may use">
          {view.tools.map((t) => (
            <Tool key={t.name} tool={t} onChange={(on) => void run(() => window.otty.setConnectionTool(view.id, t.name, on))} />
          ))}
        </Group>
      )}
      <div className="confirm-card__row">
        {view.kind === 'mcp' && (
          <button className="btn btn--soft btn--small" disabled={busy} onClick={() => void run(() => window.otty.recheckConnection(view.id))}>
            {busy ? 'Checking…' : 'Check again'}
          </button>
        )}
        {view.status === 'needs-sign-in' && (
          <button className="btn btn--soft btn--small" disabled={busy} onClick={() => void run(() => window.otty.signInAgain(view.id))}>
            Sign in again
          </button>
        )}
        <HoldButton label="Hold to disconnect" what={view.label} onDone={() => void window.otty.removeConnection(view.id).then((s) => (onRemoved(), onState(s)))} />
      </div>
    </div>
  )
}

export function Connections({ state, onChange }: { state: ConnectionsState; onChange: (s: ConnectionsState) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null)

  const refresh = async () => onChange(await window.otty.connections())
  const toggle = (id: string) => {
    setError('')
    setNotice(null)
    setOpen(open === id ? null : id)
  }
  const webOff = !state.online

  return (
    <>
      {state.connected.length > 0 && (
        <Group label="Connected">
          {state.connected.map((c) => {
            const isOpen = open === c.id
            const warn = c.status === 'needs-sign-in' || c.status === 'changed'
            return (
              <div key={c.id}>
                <button className="set-row set-row--tap" aria-expanded={isOpen} onClick={() => toggle(c.id)}>
                  <Icon name={c.kind === 'mcp' ? GLYPH.mcp : GLYPH[c.kind]} className="set-row__glyph" />
                  <span className="set-row__text">
                    <span className="set-row__title">{c.label}</span>
                    <span className="set-row__desc">{c.reads}</span>
                  </span>
                  {warn && <span className="set-row__sum set-row__sum--warn">Needs you</span>}
                  {c.status === 'off' && <span className="set-row__sum">Off</span>}
                  <Icon name={isOpen ? 'angle-small-up' : 'angle-small-down'} className="set-row__chevron" />
                </button>
                {isOpen && (
                  <Detail view={c} onState={onChange} fail={setError} say={setNote} busy={busy} setBusy={setBusy} onRemoved={() => setOpen(null)} />
                )}
                {isOpen && notice?.id === c.id && <div className="ok-card">{notice.text}</div>}
                {isOpen && error && <div className="error-card">{error}</div>}
                {isOpen && note && <div className="ok-card">{note}</div>}
              </div>
            )
          })}
        </Group>
      )}

      <Group label="Add a connection">
        {state.offers.map((o) => {
          const key = `add-${o.kind}`
          const isOpen = open === key
          const blocked = !o.available || (webOff && o.kind !== 'apple')
          const description = blocked && (o.why ?? (webOff && o.kind !== 'apple' ? OFF : undefined))
          return (
            <div key={o.kind}>
              <button className={`set-row set-row--tap${blocked ? ' set-row--off' : ''}`} disabled={blocked} aria-expanded={isOpen} onClick={() => toggle(key)}>
                <Icon name={GLYPH[o.kind]} className="set-row__glyph" />
                <span className="set-row__text">
                  <span className="set-row__title">{OFFER[o.kind].title}</span>
                  <span className="set-row__desc">{description || OFFER[o.kind].description}</span>
                </span>
                <Icon name={isOpen ? 'angle-small-up' : 'angle-small-down'} className="set-row__chevron" />
              </button>
              {isOpen && (
                <div className="set-conn">
                  <ConnectForm kind={o.kind} onDone={(view, message) => (setNotice({ id: view.id, text: message }), setOpen(view.id), void refresh())} />
                </div>
              )}
            </div>
          )
        })}
        <div>
          <button className={`set-row set-row--tap${webOff ? ' set-row--off' : ''}`} disabled={webOff} aria-expanded={open === 'add-mcp'} onClick={() => toggle('add-mcp')}>
            <Icon name={GLYPH.mcp} className="set-row__glyph" />
            <span className="set-row__text">
              <span className="set-row__title">{OWN}</span>
              <span className="set-row__desc">{webOff ? OFF : OWN_DESCRIPTION}</span>
            </span>
            <Icon name={open === 'add-mcp' ? 'angle-small-up' : 'angle-small-down'} className="set-row__chevron" />
          </button>
          {open === 'add-mcp' && (
            <div className="set-conn">
              <ConnectForm kind="mcp" onDone={(view, message) => (setNotice({ id: view.id, text: message }), setOpen(view.id), void refresh())} />
            </div>
          )}
        </div>
      </Group>
      <p className="hint" style={{ marginTop: 'var(--s-3)' }}>
        Connections only work while you’re asking. Background look-ups never use them.
      </p>
    </>
  )
}

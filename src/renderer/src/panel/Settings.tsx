import { useState } from 'react'
import type { KeepChats, PublicSettings } from '../../../shared/types'
import { serviceAt, serviceById } from '../../../shared/services'
import { connectionReady, ConnectionFields } from '../components/ConnectionFields'
import { HomeLanguagePicker } from '../components/HomeLanguagePicker'
import { Icon } from '../components/Icon'

const KEEP: { value: KeepChats; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '1y', label: '1 year' },
  { value: 'forever', label: 'Forever' }
]

export function Settings({ settings, onSaved }: { settings: PublicSettings; onSaved: (s: PublicSettings) => void }) {
  const [form, setForm] = useState(settings)
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [forgot, setForgot] = useState(false)

  const set = <K extends keyof PublicSettings>(k: K, v: PublicSettings[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const { hasApiKey: _h, needsKey: _n, savedKeys: _s, ...rest } = form
    const s = await window.otty.saveSettings({ ...rest, ...(key.trim() ? { apiKey: key.trim() } : {}) })
    setKey('')
    onSaved(s)
    setForm(s)
    setStatus(await window.otty.testConnection())
    setSaving(false)
  }

  return (
    <div className="settings">
      <section>
        <h3>
          <Icon name="brain" /> AI connection
        </h3>
        <ConnectionFields value={form} onChange={(c) => setForm((f) => ({ ...f, ...c }))} apiKey={key} onKey={setKey} savedKeys={form.savedKeys} />
        <label className="toggle">
          <input type="checkbox" checked={form.thinking} onChange={(e) => set('thinking', e.target.checked)} />
          <span>
            <b>Think deeper</b> — better for hard questions, but slower
          </span>
        </label>
      </section>

      <section>
        <h3>
          <Icon name="paw" /> Otty
        </h3>
        <label className="toggle">
          <input type="checkbox" checked={form.showBubble} onChange={(e) => set('showBubble', e.target.checked)} />
          <span>Show the floating otter button</span>
        </label>
        <label className="label">
          Shortcut: ask about highlighted text
          <input className="field" value={form.askHotkey} onChange={(e) => set('askHotkey', e.target.value)} />
        </label>
        <label className="label">
          Shortcut: snap part of the screen
          <input className="field" value={form.snapHotkey} onChange={(e) => set('snapHotkey', e.target.value)} />
        </label>
        <p className="hint">Shortcuts use names like Alt, Shift, Command, Control and Space joined by “+”.</p>
      </section>

      <section>
        <h3>
          <Icon name="language" /> My other language
        </h3>
        <p className="hint">For when a word or a step is easier in your own language. The app itself stays in English.</p>
        <HomeLanguagePicker value={form.homeLanguage} onChange={(v) => set('homeLanguage', v)} />
      </section>

      <section>
        <h3>
          <Icon name="shield-check" /> Privacy
        </h3>
        <label className="toggle">
          <input type="checkbox" checked={form.shareAppContext} onChange={(e) => set('shareAppContext', e.target.checked)} />
          <span>
            <b>Tell Otty which app I’m using</b> — sends the app’s name, window title and web page address (without
            anything after “?”) with your question, so answers fit what you’re doing
          </span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={form.rememberChats} onChange={(e) => set('rememberChats', e.target.checked)} />
          <span>
            <b>Remember my chats</b> on this Mac, under Recent chats. This keeps the text Otty read from files you
            attach, but never the files themselves or any pictures. Turning this off forgets saved chats.
          </span>
        </label>
        {form.rememberChats && (
          <div className="label">
            Keep chats for
            <div className="choices choices--row" role="radiogroup" aria-label="Keep chats for">
              {KEEP.map((k) => (
                <label key={k.value} className={`choice${form.keepChats === k.value ? ' choice--on' : ''}`}>
                  <input type="radio" name="keep-chats" checked={form.keepChats === k.value} onChange={() => set('keepChats', k.value)} />
                  <span className="choice__text">
                    <b>{k.label}</b>
                  </span>
                </label>
              ))}
            </div>
            <span className="hint">Counted from a chat’s last message. Older chats are forgotten when you save.</span>
          </div>
        )}
        {settings.rememberChats && (
          <button
            className="btn btn--soft btn--small"
            disabled={forgot}
            onClick={async () => {
              await window.otty.clearChats()
              setForgot(true)
            }}
          >
            {forgot ? 'All chats forgotten' : 'Forget all chats'}
          </button>
        )}
        <p className="hint">
          {serviceById(serviceAt(form.baseUrl)).webPrivacy}
        </p>
      </section>

      <button className="btn btn--primary btn--wide" disabled={saving || !connectionReady(form)} onClick={save}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {status && <div className={status.ok ? 'ok-card' : 'error-card'}>{status.message}</div>}
    </div>
  )
}

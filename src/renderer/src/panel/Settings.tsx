import { useState } from 'react'
import type { PublicSettings } from '../../../shared/types'

export function Settings({ settings, onSaved }: { settings: PublicSettings; onSaved: (s: PublicSettings) => void }) {
  const [form, setForm] = useState(settings)
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof PublicSettings>(k: K, v: PublicSettings[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const { hasApiKey: _h, ...rest } = form
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
        <h3>🧠 AI connection</h3>
        <label className="label">
          API key
          <input
            className="field"
            type="password"
            placeholder={settings.hasApiKey ? 'Saved ✓ (paste to replace)' : 'sk-…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <label className="label">
          Model
          <input className="field" value={form.model} onChange={(e) => set('model', e.target.value)} />
        </label>
        <label className="label">
          Server address
          <input className="field" value={form.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={form.thinking} onChange={(e) => set('thinking', e.target.checked)} />
          <span>
            <b>Think deeper</b> — better for hard questions, but slower
          </span>
        </label>
      </section>

      <section>
        <h3>🦦 Otty</h3>
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

      <button className="btn btn--primary btn--wide" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {status && <div className={status.ok ? 'ok-card' : 'error-card'}>{status.message}</div>}
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { KeepChats, PublicSettings, UsageReport } from '../../../shared/types'
import { serviceAt, serviceById } from '../../../shared/services'
import { connectionReady, ConnectionFields } from '../components/ConnectionFields'
import { HomeLanguagePicker } from '../components/HomeLanguagePicker'
import { Icon } from '../components/Icon'
import { MemorySection } from './MemorySection'

const KEEP: { value: KeepChats; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '1y', label: '1 year' },
  { value: 'forever', label: 'Forever' }
]

function TakenHotkey({ settings, hotkey }: { settings: PublicSettings; hotkey: string }) {
  if (!settings.takenHotkeys.includes(hotkey)) return null
  return <p className="hint hint--warn">Another app is using this shortcut. Pick a different one.</p>
}

/** "About 1.8 million", "about 42,000": tokens mean nothing to most people, so it stays a rough size. */
function roughly(n: number): string {
  if (n >= 950_000) return `about ${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} million`
  if (n >= 1_000) return `about ${Math.round(n / 1_000).toLocaleString()},000`
  return String(n)
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

/** What Otty has asked of the user's AI service lately. Counts from this Mac; the service's own page has the bill. */
function UsageSection() {
  const [usage, setUsage] = useState<UsageReport | null>(null)
  useEffect(() => void window.otty.getUsage().then(setUsage), [])
  if (!usage) return null
  return (
    <section>
      <h3>
        <Icon name="stats" /> What Otty has used
      </h3>
      {usage.questions || usage.jobs ? (
        <p className="usage">
          In the last {usage.days} days: <b>{plural(usage.questions, 'question')}</b>
          {usage.jobs ? <>, <b>{plural(usage.jobs, 'look-up')}</b> in the background</> : null}
          {usage.searches || usage.pages ? (
            <>
              , {plural(usage.searches, 'search', 'searches')} and {plural(usage.pages, 'page')} read
            </>
          ) : null}
          . That came to {roughly(usage.tokens)} tokens, the pieces of text {usage.service} charges for.
        </p>
      ) : (
        <p className="hint">Nothing yet. Otty counts what it asks of {usage.service} here, on this Mac.</p>
      )}
      {usage.usageUrl && (
        <button type="button" className="link-btn" onClick={() => window.otty.openExternal(usage.usageUrl!)}>
          See what it cost on {usage.service} <Icon name="arrow-up-right-from-square" />
        </button>
      )}
    </section>
  )
}

export function Settings({
  settings,
  onSaved,
  memoryFocus = 0,
  onOpenChat
}: {
  settings: PublicSettings
  onSaved: (s: PublicSettings) => void
  /** Bumped when Edit on a Noted line asks for the list. */
  memoryFocus?: number
  onOpenChat: () => void
}) {
  const [form, setForm] = useState(settings)
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [forgot, setForgot] = useState(false)

  const set = <K extends keyof PublicSettings>(k: K, v: PublicSettings[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const { hasApiKey: _h, needsKey: _n, savedKeys: _s, readsPages: _r, takenHotkeys: _t, canOpenAtLogin: _c, ...rest } = form
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
            <b>Always think deeper</b> — Otty already does for math problems. This does it for every question, which is slower
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
        <label className="toggle">
          <input type="checkbox" checked={form.notifyDone} onChange={(e) => set('notifyDone', e.target.checked)} />
          <span>
            <b>Tell me when something is ready</b> — a Mac notification when something Otty looked into for you is done, or needs your OK
          </span>
        </label>
        <label className={`toggle${form.canOpenAtLogin ? '' : ' toggle--off'}`}>
          <input type="checkbox" disabled={!form.canOpenAtLogin} checked={form.openAtLogin} onChange={(e) => set('openAtLogin', e.target.checked)} />
          <span>
            <b>Open Otty when I log in</b> — so things you ask Otty to check later still happen after a restart
            {!form.canOpenAtLogin && ' (only in the installed app)'}
          </span>
        </label>
        <label className="label">
          Shortcut: ask about highlighted text
          <input className="field" value={form.askHotkey} onChange={(e) => set('askHotkey', e.target.value)} />
        </label>
        <TakenHotkey settings={form} hotkey={form.askHotkey} />
        <label className="label">
          Shortcut: snap part of the screen
          <input className="field" value={form.snapHotkey} onChange={(e) => set('snapHotkey', e.target.value)} />
        </label>
        <TakenHotkey settings={form} hotkey={form.snapHotkey} />
        <label className="label">
          Shortcut: capture the whole screen
          <input className="field" value={form.screenHotkey} onChange={(e) => set('screenHotkey', e.target.value)} />
        </label>
        <TakenHotkey settings={form} hotkey={form.screenHotkey} />
        <p className="hint">The whole screen includes everything on it, such as notifications and other windows. Nothing is sent until you ask.</p>
        <p className="hint">Shortcuts use names like Alt, Shift, Command, Control and Space joined by “+”.</p>
      </section>

      <section>
        <h3>
          <Icon name="language" /> My other language
        </h3>
        <p className="hint">For when a word or a step is easier in your own language. The app itself stays in English.</p>
        <HomeLanguagePicker value={form.homeLanguage} onChange={(v) => set('homeLanguage', v)} />
      </section>

      <UsageSection />

      <MemorySection learn={form.learn} onLearn={(on) => set('learn', on)} focus={memoryFocus} onOpenChat={onOpenChat} />

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

import { useEffect, useState } from 'react'
import type { Permissions, PublicSettings } from '../../../shared/types'
import { Otter } from '../components/Otter'
import { prettyKey } from '../lib/keys'

export function Onboarding({ settings, onDone }: { settings: PublicSettings; onDone: (s: PublicSettings) => void }) {
  const [step, setStep] = useState(0)
  const [key, setKey] = useState('')
  const [hasKey, setHasKey] = useState(settings.hasApiKey)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [perms, setPerms] = useState<Permissions | null>(null)

  // Live-refresh permission ticks while the user is in System Settings.
  useEffect(() => {
    if (step !== 2) return
    const tick = () => window.otty.getPermissions().then(setPerms)
    tick()
    const t = setInterval(tick, 1500)
    return () => clearInterval(t)
  }, [step])

  const saveAndTest = async () => {
    setTesting(true)
    setTest(null)
    if (key.trim()) {
      const s = await window.otty.saveSettings({ apiKey: key.trim() })
      setHasKey(s.hasApiKey)
    }
    setTest(await window.otty.testConnection())
    setTesting(false)
  }

  const finish = async () => onDone(await window.otty.saveSettings({ onboarded: true }))

  return (
    <div className="onboarding">
      <div className="steps">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`steps__dot ${i <= step ? 'steps__dot--on' : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="onboarding__page">
          <Otter state="happy" size={110} />
          <h2>Hi! I’m Otty 🦦</h2>
          <p>
            I float on your screen and help you understand things. Highlight some text or snap a picture of your screen,
            and I’ll explain it in plain words.
          </p>
          <button className="btn btn--primary btn--wide" onClick={() => setStep(1)}>
            Let’s get started
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="onboarding__page">
          <h2>Give Otty a brain 🧠</h2>
          <p>
            Otty uses DeepSeek to think. Paste your key below — it stays locked in your Mac’s Keychain.
          </p>
          <button className="link-btn" onClick={() => window.otty.openExternal('https://platform.deepseek.com/api_keys')}>
            Don’t have a key? Get one here →
          </button>
          <input
            className="field"
            type="password"
            placeholder={hasKey ? 'Key saved ✓ (paste to replace)' : 'sk-…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveAndTest()}
            autoFocus
          />
          <button className="btn btn--soft btn--wide" disabled={testing || (!key.trim() && !hasKey)} onClick={saveAndTest}>
            {testing ? 'Checking…' : 'Save & test'}
          </button>
          {test && <div className={test.ok ? 'ok-card' : 'error-card'}>{test.message}</div>}
          <button className="btn btn--primary btn--wide" disabled={!test?.ok} onClick={() => setStep(2)}>
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="onboarding__page">
          <h2>Two quick permissions</h2>
          <p>macOS asks you to approve these so Otty can see what you point it at. Otty only looks when you ask.</p>
          <PermissionRow
            ok={perms?.accessibility}
            title="Accessibility"
            why={`Reads text you highlight when you press ${prettyKey(settings.askHotkey)} or click Otty.`}
            onOpen={() => window.otty.openPermissionSettings('accessibility')}
          />
          <PermissionRow
            ok={perms?.screen}
            title="Screen Recording"
            why="Lets your screen snips include other apps’ windows."
            onOpen={() => window.otty.openPermissionSettings('screen')}
          />
          <p className="hint">Tip: after turning on Screen Recording, macOS may ask you to reopen Otty.</p>
          <button className="btn btn--primary btn--wide" onClick={finish}>
            {perms?.accessibility && perms?.screen ? 'All set — let’s go!' : 'Skip for now'}
          </button>
        </div>
      )}
    </div>
  )
}

function PermissionRow(props: { ok?: boolean; title: string; why: string; onOpen: () => void }) {
  return (
    <div className="perm-row">
      <span className="perm-row__status">{props.ok ? '✅' : '⚪️'}</span>
      <div className="perm-row__text">
        <b>{props.title}</b>
        <span>{props.why}</span>
      </div>
      {!props.ok && (
        <button className="btn btn--soft btn--small" onClick={props.onOpen}>
          Allow
        </button>
      )}
    </div>
  )
}

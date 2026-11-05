import { useState } from 'react'
import type { ApiFormat, PublicSettings } from '../../../shared/types'
import { serviceAt, serviceById, SERVICES, type ServiceId } from '../../../shared/services'
import { Icon } from './Icon'

export type Connection = Pick<PublicSettings, 'baseUrl' | 'model' | 'apiFormat'>

/** True when the user has filled in enough to try it. */
export function connectionReady(c: Connection): boolean {
  return Boolean(c.model.trim() && c.baseUrl.trim())
}

/** Choosing a service, its key and its details. Used in Settings and on the welcome page. */
export function ConnectionFields({
  value,
  onChange,
  apiKey,
  onKey,
  savedKeys,
  autoFocus
}: {
  value: Connection
  onChange: (c: Connection) => void
  apiKey: string
  onKey: (key: string) => void
  savedKeys: ServiceId[]
  autoFocus?: boolean
}) {
  const [advanced, setAdvanced] = useState(false)
  const picked = serviceAt(value.baseUrl)
  const service = serviceById(picked)
  const showAddress = advanced || picked === 'custom'

  const pick = (id: ServiceId) => {
    const s = serviceById(id)
    onKey('')
    onChange({ baseUrl: s.baseUrl, model: s.model, apiFormat: 'auto' })
  }

  return (
    <div className="connection">
      <div className="choices" role="radiogroup" aria-label="Otty’s brain">
        {SERVICES.map((s) => (
          <label key={s.id} className={`choice${picked === s.id ? ' choice--on' : ''}`}>
            <input type="radio" name="service" checked={picked === s.id} onChange={() => pick(s.id)} />
            <span className="choice__text">
              <b>{s.label}</b>
              <span>{s.blurb}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="hint">{service.privacy}</p>

      {picked !== 'local' && (
        <label className="label">
          API key
          <input
            className="field"
            type="password"
            placeholder={savedKeys.includes(picked) ? 'Saved (paste to replace)' : service.keyHint}
            value={apiKey}
            onChange={(e) => onKey(e.target.value)}
            autoFocus={autoFocus}
          />
        </label>
      )}
      {service.keyUrl && (
        <button type="button" className="link-btn" onClick={() => window.otty.openExternal(service.keyUrl!)}>
          Don’t have a key? Get one here <Icon name="arrow-up-right-from-square" />
        </button>
      )}
      {picked === 'local' && <p className="hint">Start Ollama or LM Studio first, then enter the name of a model you’ve downloaded.</p>}

      <label className="label">
        Model
        <input
          className="field"
          value={value.model}
          placeholder="The model’s name"
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        />
      </label>

      {showAddress && (
        <>
          <label className="label">
            Server address
            <input
              className="field"
              value={value.baseUrl}
              placeholder="https://…"
              onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            />
          </label>
          <label className="label">
            API format
            <select className="field" value={value.apiFormat} onChange={(e) => onChange({ ...value, apiFormat: e.target.value as ApiFormat })}>
              <option value="auto">Automatic</option>
              <option value="openai">OpenAI-style</option>
              <option value="anthropic">Anthropic-style</option>
            </select>
          </label>
        </>
      )}
      {picked !== 'custom' && !advanced && (
        <button type="button" className="link-btn" onClick={() => setAdvanced(true)}>
          Advanced
        </button>
      )}
    </div>
  )
}

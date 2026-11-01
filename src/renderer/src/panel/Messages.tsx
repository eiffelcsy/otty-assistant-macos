import { useState } from 'react'
import type { AppInfo, ScreenContext } from '../../../shared/types'
import { Icon } from '../components/Icon'
import type { Assistant } from '../lib/useChat'
import { Markdown } from './Markdown'

export function ContextPreview({ ctx, compact = false }: { ctx: ScreenContext; compact?: boolean }) {
  if (ctx.kind === 'image' && !ctx.dataUrl) {
    // Saved chats never keep pictures.
    return (
      <div className="context-text">
        <span className="context-text__label">
          <Icon name="scissors" /> Screen snip (not saved)
        </span>
      </div>
    )
  }
  if (ctx.kind === 'image') return <img className="context-img" src={ctx.dataUrl} alt="Your screen snip" />
  const max = compact ? 90 : 160
  return (
    <div className="context-text">
      <span className="context-text__label">
        <Icon name="highlighter" /> Highlighted
      </span>
      <span className="context-text__body">{ctx.text.length > max ? ctx.text.slice(0, max) + '…' : ctx.text}</span>
    </div>
  )
}

/** “In Safari · Page title”: which app Otty will be told about. `onRemove` makes it dismissable. */
export function AppTag({ app, onRemove }: { app: AppInfo; onRemove?: () => void }) {
  const detail = app.title || (app.url && hostOf(app.url))
  return (
    <span className="app-tag" title={[app.title, app.url].filter(Boolean).join('\n') || app.name}>
      <Icon name={app.url ? 'globe' : 'apps'} />
      <span className="app-tag__text">
        In <b>{app.name}</b>
        {detail && <> · {detail}</>}
      </span>
      {onRemove && (
        <button className="app-tag__x" title="Don’t tell Otty about this app" onClick={onRemove}>
          <Icon name="cross-small" />
        </button>
      )}
    </span>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function AssistantMessage({ m }: { m: Assistant }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="msg msg--otty">
      {m.tools.length > 0 && (
        <div className="tool-chips">
          {m.tools.map((t) => (
            <span key={t.callId} className={`tool-chip tool-chip--${t.status}`}>
              <Icon name={t.icon ?? 'tools'} />
              {t.label}
              {t.status === 'running' && '…'}
              {t.status === 'denied' && ' (skipped)'}
              {t.status === 'error' && ' (didn’t work)'}
            </span>
          ))}
        </div>
      )}
      {m.text && (
        <div className="msg__bubble">
          <Markdown text={m.text} />
        </div>
      )}
      {m.confirm && (
        <div className="confirm-card">
          <div className="confirm-card__title">{m.confirm.title}</div>
          <div className="confirm-card__detail">{m.confirm.detail}</div>
          <div className="confirm-card__row">
            <button className="btn btn--primary" onClick={() => window.otty.respondConfirm(m.confirm!.confirmId, true)}>
              Yes, go ahead
            </button>
            <button className="btn btn--soft" onClick={() => window.otty.respondConfirm(m.confirm!.confirmId, false)}>
              No thanks
            </button>
          </div>
        </div>
      )}
      {m.error && (
        <div className="error-card">
          <Icon name="sad" />
          <span>{m.error}</span>
        </div>
      )}
      {!m.streaming && m.text && (
        <button
          className="copy-btn"
          onClick={() => {
            window.otty.copyText(m.text.replace(/\[([^\]]+)\]\(#explain\)/g, '$1'))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          <Icon name={copied ? 'check' : 'copy-alt'} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </div>
  )
}

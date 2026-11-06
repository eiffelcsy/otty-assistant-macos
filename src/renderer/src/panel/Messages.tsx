import { useContext, useState } from 'react'
import type { AppInfo, Capture, MemoryNote, ScreenContext, ToolChipInfo } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { capturedText } from '../../../shared/captures'
import { withoutFixedFence } from '../../../shared/diff'
import type { Assistant, UiMessage } from '../lib/useChat'
import { AskContext, Markdown, ProofreadContext } from './Markdown'

export function ContextPreview({ ctx, compact = false }: { ctx: ScreenContext; compact?: boolean }) {
  if (ctx.kind === 'image' && !ctx.dataUrl) {
    // Saved chats never keep pictures.
    return (
      <div className="context-text">
        <span className="context-text__label">
          <Icon name={ctx.wholeScreen ? 'expand' : 'scissors'} /> {ctx.wholeScreen ? 'Whole screen' : 'Screen snip'} (not saved)
        </span>
      </div>
    )
  }
  if (ctx.kind === 'image') {
    const { dataUrl } = ctx
    return (
      <div className="context-picture">
        {ctx.wholeScreen && (
          <span className="context-text__label context-picture__label">
            <Icon name="expand" /> Whole screen
          </span>
        )}
        <img className="context-img" src={dataUrl} alt="Your screen snip" />
        <button className="context-picture__pickup" title="Select and copy the words in this picture" onClick={() => void window.otty.pickUpText(dataUrl)}>
          <Icon name="text" /> Pick up text
        </button>
      </div>
    )
  }
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

/**
 * Captures with the app each came from: in the tray (removable, when `onRemove` is set) and on a sent message.
 * `onForgetApp` lets the user stop Otty being told about one capture's app.
 */
export function CaptureList({
  captures,
  compact = false,
  onRemove,
  onForgetApp
}: {
  captures: Capture[]
  compact?: boolean
  onRemove?: (id: string) => void
  onForgetApp?: (id: string) => void
}) {
  return (
    <div className={`captures${captures.length > 1 ? ' captures--many' : ''}`}>
      {captures.map((c) => (
        <div key={c.id} className="capture">
          {c.app && <AppTag app={c.app} onRemove={onForgetApp && (() => onForgetApp(c.id))} />}
          <ContextPreview ctx={c.context} compact={compact} />
          {onRemove && (
            <button className="context-card__x" title="Remove" onClick={() => onRemove(c.id)}>
              <Icon name="cross-small" />
            </button>
          )}
        </div>
      ))}
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

/** "In 中文, please": asks for the last answer again in the other language. Only offered on the latest answer. */
export interface AgainOffer {
  label: string
  onClick: () => void
}

/** The text the user highlighted for this answer, so a proofread card can show what changed. */
export function sourceFor(messages: UiMessage[], id: string): string {
  const asked = messages.slice(0, messages.findIndex((m) => m.id === id)).reverse().find((m) => m.role === 'user')
  return asked?.role === 'user' ? capturedText(asked.captures) : ''
}

function ToolChip({ tool: t }: { tool: ToolChipInfo }) {
  const [copied, setCopied] = useState(false)
  const words = (
    <>
      <Icon name={copied ? 'check' : (t.icon ?? 'tools')} />
      {copied ? 'Copied' : t.label}
      {t.status === 'running' && '…'}
      {t.status === 'denied' && ' (skipped)'}
      {t.status === 'error' && ' (didn’t work)'}
    </>
  )
  if (!t.copy) return <span className={`tool-chip tool-chip--${t.status}`}>{words}</span>
  return (
    <button
      className={`tool-chip tool-chip--${t.status} tool-chip--tap`}
      title="Copy the result"
      onClick={() => {
        void window.otty.copyText(t.copy!)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {words}
    </button>
  )
}

const NOTED: Record<MemoryNote['action'], string> = { added: 'Noted', updated: 'Updated', forgotten: 'Forgotten' }

/** What Otty just learned, in the open. Trust comes from seeing it and being able to take it back, not from being asked. */
function MemoryLine({ answerId, note }: { answerId: string; note: MemoryNote }) {
  return (
    <div className={`memory-line${note.undone ? ' memory-line--undone' : ''}`}>
      <Icon name="bookmark" />
      <span className="memory-line__text">
        {NOTED[note.action]}: {note.text}
      </span>
      {note.undone ? (
        <span className="memory-line__done">Undone</span>
      ) : (
        <>
          <button className="memory-line__btn" onClick={() => void window.otty.undoMemory(answerId, note.memoryId)}>
            Undo
          </button>
          {note.action !== 'forgotten' && (
            <button className="memory-line__btn" onClick={() => void window.otty.openMemories()}>
              Edit
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** A sum Otty worked out by itself, with no model call. */
function CalcCard({ calc }: { calc: NonNullable<Assistant['calc']> }) {
  return (
    <div className="calc-card">
      <div className="calc-card__sum">{calc.expression}</div>
      <div className="calc-card__result">= {calc.result}</div>
    </div>
  )
}

export function AssistantMessage({ m, again, found, source = '' }: { m: Assistant; again?: AgainOffer; found?: boolean; source?: string }) {
  const [copied, setCopied] = useState(false)
  const ask = useContext(AskContext)
  return (
    <div className={`msg msg--otty${found ? ' msg--found' : ''}`} data-msg-id={m.id}>
      {m.tools.length > 0 && (
        <div className="tool-chips">
          {m.tools.map((t) => (
            <ToolChip key={t.callId} tool={t} />
          ))}
        </div>
      )}
      {m.calc && <CalcCard calc={m.calc} />}
      {m.text && !m.calc && (
        <div className="msg__bubble">
          <ProofreadContext.Provider value={{ source, done: !m.streaming }}>
            <Markdown text={m.text} language={m.language} />
          </ProofreadContext.Provider>
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
        <div className="msg__actions">
          <button
            className="copy-btn"
            onClick={() => {
              window.otty.copyText(m.calc?.result ?? withoutFixedFence(m.text).replace(/\[([^\]]+)\]\(#explain\)/g, '$1'))
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            <Icon name={copied ? 'check' : 'copy-alt'} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          {m.calc && (
            <button className="copy-btn" onClick={() => ask('Explain the working', 'working')}>
              <Icon name="list" />
              Explain the working
            </button>
          )}
          {again && !m.calc && (
            <button className="copy-btn" onClick={again.onClick}>
              <Icon name="language" />
              {again.label}
            </button>
          )}
        </div>
      )}
      {m.memories?.map((n) => <MemoryLine key={n.memoryId} answerId={m.id} note={n} />)}
    </div>
  )
}

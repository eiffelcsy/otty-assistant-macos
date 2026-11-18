import { useContext, useEffect, useRef, useState } from 'react'
import type { AppInfo, Capture, EditDraft, MemoryNote, RewindPlan, ScreenContext, ToolChipInfo, UsedMemory } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { HiddenSheet } from '../components/HiddenSheet'
import { StepCard } from '../components/StepCard'
import { ConfirmCard, ReceiptLine } from '../components/ConfirmCard'
import { DrawingCard } from '../draw/DrawingCard'
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
  const asked = messages
    .slice(
      0,
      messages.findIndex((m) => m.id === id)
    )
    .reverse()
    .find((m) => m.role === 'user')
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

const NOTED: Record<MemoryNote['action'], string> = { added: 'Noted', updated: 'Updated', forgotten: 'Forgot' }

/**
 * What Otty just learned, in the open, in full (Spec 01, N1–N3). Trust comes from seeing it and being able to take it
 * back, not from being asked. `fresh` draws the underline once, on an answer arriving now.
 */
function MemoryLine({ answerId, note, fresh }: { answerId: string; note: MemoryNote; fresh: boolean }) {
  const words = `${NOTED[note.action]}: ${note.text}`
  return (
    <div className={`memory-line${note.undone ? ' memory-line--undone' : ''}${fresh ? ' memory-line--fresh' : ''}`}>
      <Icon name="bookmark" />
      <span className="memory-line__text">
        <span className="memory-line__label">{NOTED[note.action]}:</span> <span className="memory-line__fact">{note.text}</span>
        {note.action === 'updated' && note.before && <span className="memory-line__was"> (was: {note.before})</span>}
        <span className="memory-line__actions">
          {note.undone ? (
            <span className="memory-line__done">{note.action === 'forgotten' ? 'Remembered again' : 'Forgotten'}</span>
          ) : (
            <>
              <button className="memory-line__btn" aria-label={`Undo: ${words}`} onClick={() => void window.otty.undoMemory(answerId, note.memoryId)}>
                Undo
              </button>
              {note.action !== 'forgotten' && (
                <button className="memory-line__btn" onClick={() => void window.otty.openMemories()}>
                  Edit
                </button>
              )}
            </>
          )}
        </span>
      </span>
    </div>
  )
}

/** The notes an answer read, folded into one button in the action row; its menu lists them (UX_REVIEW #6). */
function UsedMarker({ used }: { used: UsedMemory[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const label = `Used ${used.length === 1 ? '1 note' : `${used.length} notes`} from your Notebook`
  return (
    <div className="used" ref={box}>
      <button className="icon-btn icon-btn--sm used__btn" title={label} aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <Icon name="bookmark" />
      </button>
      {open && (
        <div className="menu used__menu" role="menu">
          {used.map((u) => (
            <div key={u.memoryId} className="menu__item menu__item--text" role="menuitem">
              {u.text}
            </div>
          ))}
          <button className="menu__item" role="menuitem" onClick={() => void window.otty.openMemories()}>
            Open the Notebook
          </button>
        </div>
      )}
    </div>
  )
}

/** Under a question: keys Otty took out of what was typed or highlighted before sending it (D-32). */
export function HiddenLine({ id, hidden }: { id: string; hidden?: number }) {
  const [open, setOpen] = useState(false)
  if (!hidden) return null
  return (
    <>
      <button
        className="hidden-line"
        aria-expanded={open}
        title="Things that looked like keys or passwords became [hidden key], here and in what was sent. Tap to see which lines."
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="shield-check" />
        <span>{hidden === 1 ? 'Otty hid 1 key before sending' : `Otty hid ${hidden} keys before sending`}</span>
      </button>
      {open && <HiddenSheet id={id} />}
    </>
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

type RewindMode = 'retry' | 'edit'

/**
 * Before Try again or Edit replaces an answer (D-36): what it did that Otty can take back, ticked by default, and
 * what it can't. Only shown when there's something to say.
 */
function RewindCard({ mode, plan, onGo, onCancel }: { mode: RewindMode; plan: RewindPlan; onGo: (undo: string[]) => void; onCancel: () => void }) {
  const [ticked, setTicked] = useState(() => new Set(plan.undo.map((u) => u.id)))
  const card = useRef<HTMLDivElement>(null)
  // It opens under the last answer, which may be scrolled off the bottom. Only the chat scrolls, never the window.
  useEffect(() => {
    const el = card.current
    const chat = el?.closest<HTMLElement>('.chat, .quick__answer')
    if (el && chat) chat.scrollTo({ top: chat.scrollTop + el.getBoundingClientRect().bottom - chat.getBoundingClientRect().bottom + 12, behavior: 'smooth' })
  }, [])
  const flip = (id: string) =>
    setTicked((t) => {
      const next = new Set(t)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <div className="confirm-card rewind-card" ref={card} role="group" aria-label={mode === 'retry' ? 'Try this again?' : 'Edit your question?'}>
      <div className="ask__title">{mode === 'retry' ? 'Try this again?' : 'Edit your question?'}</div>
      <div className="ask__sub">This answer goes{mode === 'edit' ? ', and your question comes back to the box' : ''}.</div>
      {plan.undo.length > 0 && (
        <div className="rewind-card__list">
          <div className="rewind-card__label">Otty will also undo</div>
          {plan.undo.map((u) => (
            <label key={u.id} className="rewind-card__item">
              <input type="checkbox" checked={ticked.has(u.id)} onChange={() => flip(u.id)} />
              <span>{u.label}</span>
            </label>
          ))}
        </div>
      )}
      {plan.lasting.length > 0 && (
        <div className="rewind-card__list">
          <div className="rewind-card__label">Can’t be undone</div>
          {plan.lasting.map((l, i) => (
            <div key={i} className="rewind-card__item rewind-card__item--lasting">
              <Icon name="lock" />
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}
      <div className="confirm-card__row">
        <button className="btn btn--primary" onClick={() => onGo([...ticked])}>
          {mode === 'retry' ? 'Try again' : 'Edit question'}
        </button>
        <button className="btn btn--soft" onClick={onCancel}>
          Keep this answer
        </button>
      </div>
    </div>
  )
}

export function AssistantMessage({
  m,
  again,
  found,
  source = '',
  latest = false,
  onEdit
}: {
  m: Assistant
  again?: AgainOffer
  found?: boolean
  source?: string
  /** The chat's last answer: it can be tried again or have its question edited (D-36). */
  latest?: boolean
  /** Puts an edited question back in the box. Left out, there's no Edit (the quick view). */
  onEdit?: (draft: EditDraft) => void
}) {
  const [copied, setCopied] = useState(false)
  const [rewinding, setRewinding] = useState<{ mode: RewindMode; plan: RewindPlan } | null>(null)
  const ask = useContext(AskContext)
  const go = async (mode: RewindMode, undo: string[]) => {
    setRewinding(null)
    const draft = await window.otty.rewind(m.id, undo, mode)
    if (mode === 'edit' && draft) onEdit?.(draft)
  }
  const rewind = async (mode: RewindMode) => {
    const plan = await window.otty.rewindPlan(m.id)
    if (!plan) return
    if (plan.undo.length || plan.lasting.length) setRewinding({ mode, plan })
    else await go(mode, [])
  }
  const canRewind = latest && !m.streaming && !m.calc
  return (
    <div className={`msg msg--otty${found ? ' msg--found' : ''}`} data-msg-id={m.id}>
      {m.tools.length > 0 && (
        <div className="tool-chips">
          {m.tools.map((t) => (
            <ToolChip key={t.callId} tool={t} />
          ))}
        </div>
      )}
      {m.receipts?.length ? (
        <div className="receipts">
          {m.receipts.map((r, i) => (
            <ReceiptLine key={i} answerId={m.id} at={i} receipt={r} fresh={Boolean(m.live)} />
          ))}
        </div>
      ) : null}
      {m.calc && <CalcCard calc={m.calc} />}
      {m.text && !m.calc && (
        <div className="msg__bubble">
          <ProofreadContext.Provider value={{ source, done: !m.streaming }}>
            <Markdown text={m.text} language={m.language} />
          </ProofreadContext.Provider>
        </div>
      )}
      {m.charts?.map((c, i) => (
        <DrawingCard key={i} kind="mermaid" code={c.code} chart={{ table: c.table }} host={{ done: !m.streaming, ask: (text) => ask(text) }} />
      ))}
      {m.steps && <StepCard answerId={m.id} card={m.steps} stuck={!m.streaming} />}
      {m.confirm && <ConfirmCard key={m.confirm.confirmId} {...m.confirm} />}
      {m.error && (
        <div className="error-card">
          <Icon name="sad" />
          <span>{m.error}</span>
        </div>
      )}
      {!m.streaming && (m.text || canRewind || m.used?.length) && (
        <div className="msg__actions">
          {m.text && (
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
          )}
          {canRewind && (
            <button className="copy-btn" onClick={() => void rewind('retry')} title="Ask the same question again for a new answer">
              <Icon name="refresh" />
              Try again
            </button>
          )}
          {canRewind && onEdit && (
            <button className="copy-btn" onClick={() => void rewind('edit')} title="Change your question and ask it again">
              <Icon name="edit" />
              Edit question
            </button>
          )}
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
          {m.used?.length ? <UsedMarker used={m.used} /> : null}
        </div>
      )}
      {rewinding && (
        <RewindCard mode={rewinding.mode} plan={rewinding.plan} onGo={(undo) => void go(rewinding.mode, undo)} onCancel={() => setRewinding(null)} />
      )}
      {m.memories?.length ? (
        <div className="memory-lines" aria-live="polite">
          {m.memories.map((n) => (
            <MemoryLine key={n.memoryId} answerId={m.id} note={n} fresh={Boolean(m.live)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

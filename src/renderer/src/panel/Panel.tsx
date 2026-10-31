import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatEvent, PanelOpenPayload, PublicSettings, ScreenContext } from '../../../shared/types'
import { Otter } from '../components/Otter'
import { prettyKey } from '../lib/keys'
import { AskContext, Markdown } from './Markdown'
import { Onboarding } from './Onboarding'
import { Settings } from './Settings'

interface ToolChip {
  callId: string
  label: string
  status: 'running' | 'done' | 'denied' | 'error'
}

type UiMessage =
  | { id: string; role: 'user'; text: string; context: ScreenContext | null }
  | {
      id: string
      role: 'assistant'
      text: string
      tools: ToolChip[]
      confirm?: { confirmId: string; title: string; detail: string }
      error?: string
      streaming: boolean
    }

type Assistant = Extract<UiMessage, { role: 'assistant' }>

const TEXT_ACTIONS = ['Explain this simply', 'Summarize this', 'Translate this to English', 'What should I do here?']
const IMAGE_ACTIONS = ['What is this?', 'Explain this simply', 'Read out the text', 'What should I do here?']

const NOTICES: Record<string, { title: string; body: string; kind?: 'accessibility' | 'screen' }> = {
  'needs-accessibility': {
    title: 'Otty needs a little permission 🦦',
    body: 'To read the text you highlight, macOS needs you to let Otty use “Accessibility”. It only copies what you highlight, when you ask.',
    kind: 'accessibility'
  },
  'needs-screen': {
    title: 'Otty can only see your wallpaper',
    body: 'To see other apps in your snip, allow Otty under “Screen Recording”, then restart Otty.',
    kind: 'screen'
  },
  'snip-mac-only': { title: 'Snipping works on macOS', body: 'Screen snips use the Mac’s built-in snipping tool.' }
}

let localId = 0
const nextId = () => `local-${++localId}`

export function Panel() {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [view, setView] = useState<'chat' | 'settings' | 'onboarding'>('chat')
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [context, setContext] = useState<ScreenContext | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.otty.getSettings().then((s) => {
      setSettings(s)
      if (!s.onboarded) setView('onboarding')
    })
  }, [])

  useEffect(
    () =>
      window.otty.onPanelOpen((p: PanelOpenPayload) => {
        if (p.notice === 'open-settings') return setView('settings')
        if (p.context) setContext(p.context)
        setNotice(p.notice ?? null)
        setTimeout(() => inputRef.current?.focus(), 50)
      }),
    []
  )

  useEffect(
    () =>
      window.otty.onChatEvent((e: ChatEvent) => {
        const patch = (fn: (m: Assistant) => Assistant) =>
          setMessages((ms) => ms.map((m) => (m.id === e.id && m.role === 'assistant' ? fn(m) : m)))

        switch (e.type) {
          case 'start':
            setMessages((ms) => [...ms, { id: e.id, role: 'assistant', text: '', tools: [], streaming: true }])
            break
          case 'delta':
            patch((m) => ({ ...m, text: m.text + e.text }))
            break
          case 'tool':
            patch((m) => {
              const others = m.tools.filter((t) => t.callId !== e.callId)
              const confirm = e.status === 'running' ? m.confirm : undefined
              return { ...m, confirm, tools: [...others, { callId: e.callId, label: e.label, status: e.status }] }
            })
            break
          case 'confirm':
            patch((m) => ({ ...m, confirm: { confirmId: e.confirmId, title: e.title, detail: e.detail } }))
            break
          case 'done':
            patch((m) => ({ ...m, streaming: false, confirm: undefined }))
            setBusy(false)
            break
          case 'error':
            patch((m) => ({ ...m, streaming: false, confirm: undefined, error: e.message }))
            setBusy(false)
            break
        }
      }),
    []
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.explain-card')) window.otty.closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = useCallback(
    (raw: string, ctx: ScreenContext | null = context) => {
      const text = raw.trim() || (ctx ? 'Explain this simply.' : '')
      if (!text || busy) return
      setMessages((ms) => [...ms, { id: nextId(), role: 'user', text, context: ctx }])
      setContext(null)
      setNotice(null)
      setInput('')
      setBusy(true)
      window.otty.sendMessage(text, ctx)
    },
    [busy, context]
  )

  const snip = async () => {
    const p = await window.otty.captureScreenshot()
    if (p.context) setContext(p.context)
    setNotice(p.notice ?? null)
  }

  const newChat = () => {
    window.otty.resetChat()
    setMessages([])
    setContext(null)
    setNotice(null)
    setBusy(false)
  }

  if (!settings) return <div className="panel" />

  if (view === 'onboarding') {
    return (
      <div className="panel">
        <Onboarding
          settings={settings}
          onDone={(s) => {
            setSettings(s)
            setView('chat')
          }}
        />
      </div>
    )
  }

  const last = messages[messages.length - 1]
  const waitingFirstToken = busy && last?.role === 'assistant' && !last.text && !last.tools.length

  return (
    <AskContext.Provider value={(t) => send(t, null)}>
      <div className="panel">
        <header className="panel__header">
          <Otter state={busy ? 'thinking' : 'idle'} size={34} />
          <div className="panel__title">Otty</div>
          <div className="panel__actions">
            {view === 'chat' && messages.length > 0 && (
              <button className="icon-btn" title="New chat" onClick={newChat}>
                ✨
              </button>
            )}
            <button
              className="icon-btn"
              title={view === 'settings' ? 'Back to chat' : 'Settings'}
              onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
            >
              {view === 'settings' ? '💬' : '⚙️'}
            </button>
            <button className="icon-btn" title="Close (Esc)" onClick={() => window.otty.closePanel()}>
              ✕
            </button>
          </div>
        </header>

        {view === 'settings' ? (
          <Settings settings={settings} onSaved={setSettings} />
        ) : (
          <>
            <div className="chat" ref={scrollRef}>
              {messages.length === 0 && <EmptyState settings={settings} onSnip={snip} />}
              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="msg msg--user">
                    {m.context && <ContextPreview ctx={m.context} />}
                    <div className="msg__bubble">{m.text}</div>
                  </div>
                ) : (
                  <AssistantMessage key={m.id} m={m} />
                )
              )}
              {waitingFirstToken && (
                <div className="thinking">
                  <Otter state="thinking" size={40} />
                  <span className="dots">Otty is thinking</span>
                </div>
              )}
            </div>

            <footer className="composer">
              {notice && NOTICES[notice] && <NoticeCard notice={notice} onClose={() => setNotice(null)} />}
              {context && (
                <>
                  <div className="context-chip">
                    <ContextPreview ctx={context} />
                    <button className="context-chip__x" title="Remove" onClick={() => setContext(null)}>
                      ✕
                    </button>
                  </div>
                  <div className="quick-actions">
                    {(context.kind === 'image' ? IMAGE_ACTIONS : TEXT_ACTIONS).map((a) => (
                      <button key={a} className="chip" disabled={busy} onClick={() => send(a)}>
                        {a}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="composer__row">
                <button className="icon-btn icon-btn--big" title="Snap part of my screen" onClick={snip} disabled={busy}>
                  📸
                </button>
                <textarea
                  ref={inputRef}
                  className="composer__input"
                  rows={1}
                  placeholder={context ? 'Ask about this…' : 'Ask Otty anything…'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      send(input)
                    }
                  }}
                />
                {busy ? (
                  <button className="send-btn send-btn--stop" title="Stop" onClick={() => window.otty.stop()}>
                    ■
                  </button>
                ) : (
                  <button className="send-btn" title="Send" disabled={!input.trim() && !context} onClick={() => send(input)}>
                    ↑
                  </button>
                )}
              </div>
            </footer>
          </>
        )}
      </div>
    </AskContext.Provider>
  )
}

function EmptyState({ settings, onSnip }: { settings: PublicSettings; onSnip: () => void }) {
  return (
    <div className="empty">
      <Otter state="happy" size={84} />
      <h2>Hi, I’m Otty!</h2>
      <p>I can explain anything on your screen in plain words.</p>
      <div className="how-to">
        <div className="how-to__item">
          <span className="how-to__icon">🖍️</span>
          <span>
            <b>Highlight text</b> anywhere, then click me or press <kbd>{prettyKey(settings.askHotkey)}</kbd>
          </span>
        </div>
        <button className="how-to__item how-to__item--btn" onClick={onSnip}>
          <span className="how-to__icon">📸</span>
          <span>
            <b>Snap part of your screen</b> — draw a box, or press <kbd>{prettyKey(settings.snapHotkey)}</kbd>
          </span>
        </button>
        <div className="how-to__item">
          <span className="how-to__icon">💬</span>
          <span>
            Or just <b>type a question</b> below
          </span>
        </div>
      </div>
    </div>
  )
}

function ContextPreview({ ctx }: { ctx: ScreenContext }) {
  if (ctx.kind === 'image') return <img className="context-img" src={ctx.dataUrl} alt="Your screen snip" />
  return (
    <div className="context-text">
      <span className="context-text__label">🖍️ Highlighted</span>
      <span className="context-text__body">{ctx.text.length > 160 ? ctx.text.slice(0, 160) + '…' : ctx.text}</span>
    </div>
  )
}

function AssistantMessage({ m }: { m: Assistant }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="msg msg--otty">
      {m.tools.length > 0 && (
        <div className="tool-chips">
          {m.tools.map((t) => (
            <span key={t.callId} className={`tool-chip tool-chip--${t.status}`}>
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
      {m.error && <div className="error-card">🦦💦 {m.error}</div>}
      {!m.streaming && m.text && (
        <button
          className="copy-btn"
          onClick={() => {
            window.otty.copyText(m.text.replace(/\[([^\]]+)\]\(#explain\)/g, '$1'))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      )}
    </div>
  )
}

function NoticeCard({ notice, onClose }: { notice: string; onClose: () => void }) {
  const n = NOTICES[notice]
  return (
    <div className="notice-card">
      <div className="notice-card__title">{n.title}</div>
      <div className="notice-card__body">{n.body}</div>
      <div className="confirm-card__row">
        {n.kind && (
          <button className="btn btn--primary btn--small" onClick={() => window.otty.openPermissionSettings(n.kind!)}>
            Open Settings
          </button>
        )}
        <button className="btn btn--soft btn--small" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}

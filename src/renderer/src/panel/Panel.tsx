import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnswerLanguage, AppInfo, PanelOpenPayload, PublicSettings, ScreenContext } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'
import { LanguagePill } from '../components/LanguagePill'
import { actionsFor, QuickActions, type ActionItem } from '../components/QuickActions'
import { againOffer } from '../lib/again'
import { prettyKey } from '../lib/keys'
import { useChat } from '../lib/useChat'
import { AskContext, HomeContext } from './Markdown'
import { History } from './History'
import { AppTag, AssistantMessage, ContextPreview } from './Messages'
import { Onboarding } from './Onboarding'
import { Settings } from './Settings'

const NOTICES: Record<string, { title: string; body: string; kind?: 'accessibility' | 'screen' }> = {
  'needs-accessibility': {
    title: 'Otty needs a little permission',
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

export function Panel() {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [view, setView] = useState<'chat' | 'settings' | 'onboarding' | 'history'>('chat')
  const [context, setContext] = useState<ScreenContext | null>(null)
  const [app, setApp] = useState<AppInfo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchFocus, setSearchFocus] = useState(0)
  const { messages, busy, setBusy, waitingFirstToken, focusId } = useChat(() => {
    setContext(null)
    setApp(null)
    setNotice(null)
  })
  const [input, setInput] = useState('')
  /** The pill's choice for the next message only. */
  const [pick, setPick] = useState<AnswerLanguage | undefined>()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

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
        if (p.app !== undefined) setApp(p.app)
        setNotice(p.notice ?? null)
        setView((v) => (v === 'history' ? 'chat' : v))
        setTimeout(() => inputRef.current?.focus(), 50)
      }),
    []
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.explain-card')) window.otty.closePanel()
      // ⌘F: Recent chats, with the search box focused.
      if (e.key === 'f' && e.metaKey && settingsRef.current?.rememberChats && settingsRef.current.onboarded) {
        e.preventDefault()
        setView('history')
        setSearchFocus((n) => n + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Follow the conversation, unless a search result asked to show one message.
  useEffect(() => {
    const found = focusId && scrollRef.current?.querySelector(`[data-msg-id="${CSS.escape(focusId)}"]`)
    if (found) found.scrollIntoView({ block: 'center' })
    else scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, focusId, view])

  const actions = context && settings ? actionsFor(context, settings.homeLanguage) : []

  /** An empty box with a capture runs the first quick action. */
  const send = useCallback(
    (raw: string, ctx: ScreenContext | null = context, picked?: ActionItem) => {
      const item = picked ?? (!raw.trim() && ctx && settings ? actionsFor(ctx, settings.homeLanguage)[0] : undefined)
      const text = item ? item.label : raw.trim()
      if (!text || busy) return
      setContext(null)
      setApp(null)
      setNotice(null)
      setInput('')
      setPick(undefined)
      setBusy(true)
      window.otty.sendMessage(text, ctx, { app, action: item?.action, language: pick })
    },
    [busy, context, app, settings, pick]
  )

  const snip = async () => {
    const p = await window.otty.captureScreenshot()
    if (p.context) setContext(p.context)
    if (p.app !== undefined) setApp(p.app)
    setNotice(p.notice ?? null)
  }

  const newChat = () => window.otty.resetChat()
  const again = againOffer(messages, settings?.homeLanguage ?? null, busy)

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

  return (
    <AskContext.Provider value={(t) => send(t, null)}>
      <HomeContext.Provider value={settings.homeLanguage}>
        <div className="panel">
          <header className="panel__header">
            <Otter state={busy ? 'thinking' : 'idle'} size={34} />
            <div className="panel__title">{view === 'history' ? 'Recent chats' : 'Otty'}</div>
            <div className="panel__actions">
              {settings.rememberChats && (
                <button
                  className="icon-btn"
                  title={view === 'history' ? 'Back to chat' : 'Recent chats'}
                  onClick={() => setView(view === 'history' ? 'chat' : 'history')}
                >
                  <Icon name={view === 'history' ? 'comment-alt' : 'time-past'} />
                </button>
              )}
              {view === 'chat' && messages.length > 0 && (
                <button className="icon-btn" title="New chat" onClick={newChat}>
                  <Icon name="comment-medical" />
                </button>
              )}
              <button
                className="icon-btn"
                title={view === 'settings' ? 'Back to chat' : 'Settings'}
                onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
              >
                <Icon name={view === 'settings' ? 'comment-alt' : 'settings'} />
              </button>
              <button className="icon-btn" title="Close (Esc)" onClick={() => window.otty.closePanel()}>
                <Icon name="cross-small" />
              </button>
            </div>
          </header>

          {view === 'settings' ? (
            <Settings settings={settings} onSaved={setSettings} />
          ) : view === 'history' ? (
            <History onOpen={() => setView('chat')} focusSearch={searchFocus} />
          ) : (
            <>
              <div className="chat" ref={scrollRef}>
                {messages.length === 0 && <EmptyState settings={settings} onSnip={snip} />}
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className={`msg msg--user${m.id === focusId ? ' msg--found' : ''}`} data-msg-id={m.id}>
                      {m.app && <AppTag app={m.app} />}
                      {m.context && <ContextPreview ctx={m.context} />}
                      <div className="msg__bubble">{m.text}</div>
                    </div>
                  ) : (
                    <AssistantMessage
                      key={m.id}
                      m={m}
                      again={again?.id === m.id ? again.offer : undefined}
                      found={m.id === focusId}
                    />
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
                {app && <AppTag app={app} onRemove={() => setApp(null)} />}
                {context && (
                  <div className="context-card">
                    <ContextPreview ctx={context} />
                    <button className="context-card__x" title="Remove" onClick={() => setContext(null)}>
                      <Icon name="cross-small" />
                    </button>
                    <QuickActions items={actions} disabled={busy} onPick={(a) => send('', context, a)} />
                  </div>
                )}
                <div className="composer__row">
                  <button className="composer__tool" title="Snap part of my screen" onClick={snip} disabled={busy}>
                    <Icon name="scissors" />
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
                  {settings.homeLanguage && (
                    <LanguagePill home={settings.homeLanguage} value={pick} onChange={setPick} disabled={busy} />
                  )}
                  {busy ? (
                    <button className="send-btn send-btn--stop" title="Stop" onClick={() => window.otty.stop()}>
                      <Icon name="stop" solid />
                    </button>
                  ) : (
                    <button className="send-btn" title="Send" disabled={!input.trim() && !context} onClick={() => send(input)}>
                      <Icon name="arrow-small-up" />
                    </button>
                  )}
                </div>
              </footer>
            </>
          )}
        </div>
      </HomeContext.Provider>
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
          <span className="how-to__icon">
            <Icon name="highlighter" />
          </span>
          <span>
            <b>Highlight text</b> anywhere, then click me or press <kbd>{prettyKey(settings.askHotkey)}</kbd>
          </span>
        </div>
        <button className="how-to__item how-to__item--btn" onClick={onSnip}>
          <span className="how-to__icon">
            <Icon name="scissors" />
          </span>
          <span>
            <b>Snap part of your screen</b> — draw a box, or press <kbd>{prettyKey(settings.snapHotkey)}</kbd>
          </span>
        </button>
        <div className="how-to__item">
          <span className="how-to__icon">
            <Icon name="comment-dots" />
          </span>
          <span>
            Or just <b>type a question</b> below
          </span>
        </div>
      </div>
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

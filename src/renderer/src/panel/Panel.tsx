import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnswerLanguage, AppInfo, Capture, PanelOpenPayload, PublicSettings } from '../../../shared/types'
import { addCapture, MAX_CAPTURES } from '../../../shared/captures'
import { FileList, FileTray } from '../components/FileChips'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'
import { LanguagePill } from '../components/LanguagePill'
import { actionsForTray, QuickActions, type ActionItem } from '../components/QuickActions'
import { againOffer } from '../lib/again'
import { prettyKey } from '../lib/keys'
import { useAttachments } from '../lib/useAttachments'
import { useChat } from '../lib/useChat'
import { AskContext, HomeContext } from './Markdown'
import { History } from './History'
import { AppTag, AssistantMessage, CaptureList } from './Messages'
import { FindBar } from './FindBar'
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
  'snip-mac-only': { title: 'Snipping works on macOS', body: 'Screen snips use the Mac’s built-in snipping tool.' },
  'tray-full': {
    title: `Otty can look at ${MAX_CAPTURES} things at once`,
    body: 'Remove one with its ✕ to add another, or ask about these first.'
  }
}

export function Panel() {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [view, setView] = useState<'chat' | 'settings' | 'onboarding' | 'history'>('chat')
  /** The capture tray: highlights and snips waiting to be asked about, each with its own app. */
  const [captures, setCaptures] = useState<Capture[]>([])
  /** The app the user was in, for a question without captures. */
  const [app, setApp] = useState<AppInfo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchFocus, setSearchFocus] = useState(0)
  /** Find in this chat: null when the bar is closed, otherwise bumped to refocus it. */
  const [finding, setFinding] = useState<number | null>(null)
  const findingRef = useRef(finding)
  findingRef.current = finding
  const { messages, busy, setBusy, waitingFirstToken, focusId } = useChat(() => {
    setCaptures([])
    setApp(null)
    setNotice(null)
  })
  const att = useAttachments()
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [input, setInput] = useState('')
  /** The pill's choice for the next message only. */
  const [pick, setPick] = useState<AnswerLanguage | undefined>()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const capturesRef = useRef(captures)
  capturesRef.current = captures

  useEffect(() => {
    window.otty.getSettings().then((s) => {
      setSettings(s)
      if (!s.onboarded) setView('onboarding')
    })
  }, [])

  /** Adds a capture to the tray, or starts a new tray with it. A full tray says so instead. */
  const take = useCallback((p: PanelOpenPayload, add: boolean) => {
    if (!p.context) {
      // Nothing was highlighted: just note the app, unless the tray's captures already say where they're from.
      if (p.app !== undefined && !(add && capturesRef.current.length)) setApp(p.app)
      setNotice(p.notice ?? null)
      return
    }
    const r = addCapture(add ? capturesRef.current : [], p.context, p.app ?? null, crypto.randomUUID())
    if (r.ok) {
      capturesRef.current = r.captures // two quick hotkeys in a row must both land
      setCaptures(r.captures)
      setApp(null)
    }
    setNotice(p.notice ?? (!r.ok && r.reason === 'full' ? 'tray-full' : null))
  }, [])

  useEffect(
    () =>
      window.otty.onPanelOpen((p: PanelOpenPayload) => {
        if (p.notice === 'open-settings') return setView('settings')
        take(p, !!p.add)
        setView((v) => (v === 'history' ? 'chat' : v))
        setTimeout(() => inputRef.current?.focus(), 50)
      }),
    []
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.explain-card')) {
        // The first Esc only closes the find bar.
        if (findingRef.current !== null) setFinding(null)
        else window.otty.closePanel()
      }
      if (e.key.toLowerCase() !== 'f' || !e.metaKey || !settingsRef.current?.onboarded) return
      // ⌘F in a chat: find in it. ⇧⌘F, or ⌘F with nothing to find: Recent chats, with the search box focused.
      const inChat = document.querySelector('.chat') && messagesRef.current.length > 0
      if (inChat && !e.shiftKey) {
        e.preventDefault()
        setFinding((n) => (n ?? 0) + 1)
      } else if (settingsRef.current.rememberChats) {
        e.preventDefault()
        setView('history')
        setSearchFocus((n) => n + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A new chat, or leaving the chat view, closes the find bar.
  useEffect(() => {
    if (view !== 'chat' || messages.length === 0) setFinding(null)
  }, [view, messages.length])

  // Follow the conversation, unless a search result asked to show one message or the find bar is open.
  useEffect(() => {
    if (findingRef.current !== null) return
    const found = focusId && scrollRef.current?.querySelector(`[data-msg-id="${CSS.escape(focusId)}"]`)
    if (found) found.scrollIntoView({ block: 'center' })
    else scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, focusId, view])

  const actions = settings && !att.reading ? actionsForTray(captures, att.ready, settings.homeLanguage) : []

  /** An empty box with captures or attached files runs the first quick action. `tray` false sends the text alone. */
  const send = useCallback(
    (raw: string, tray = true, picked?: ActionItem) => {
      const item = picked ?? (!raw.trim() && tray ? actions[0] : undefined)
      const text = item ? item.label : raw.trim()
      if (!text || busy || att.reading) return
      const files = tray ? att.take().map((f) => f.id) : []
      const sent = tray ? captures : []
      if (tray) setCaptures([])
      setApp(null)
      setNotice(null)
      setInput('')
      setPick(undefined)
      setBusy(true)
      window.otty.sendMessage(text, sent, { app, action: item?.action, language: pick, files })
    },
    [busy, captures, app, pick, att, actions]
  )

  // Drag files from Finder onto the chat to attach them.
  const hasFiles = (e: React.DragEvent) => view === 'chat' && e.dataTransfer.types.includes('Files')
  const drop = {
    onDragEnter: (e: React.DragEvent) => {
      if (!hasFiles(e)) return
      dragDepth.current++
      setDragging(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (!dragDepth.current) setDragging(false)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      att.drop([...e.dataTransfer.files])
      inputRef.current?.focus()
    }
  }

  // The panel's own scissors always add to the tray.
  const snip = async () => take(await window.otty.captureScreenshot(), true)

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
    <AskContext.Provider value={(t) => send(t, false)}>
      <HomeContext.Provider value={settings.homeLanguage}>
        <div className="panel" {...drop}>
          {dragging && (
            <div className="drop-veil">
              <Icon name="clip" />
              <span>Drop files to ask Otty about them</span>
            </div>
          )}
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
                <button
                  className="icon-btn"
                  title="Find in this chat (⌘F)"
                  onClick={() => setFinding((n) => (n === null ? 1 : null))}
                >
                  <Icon name="search" />
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
              {finding !== null && (
                <FindBar chat={scrollRef} messages={messages} focus={finding} onClose={() => setFinding(null)} />
              )}
              <div className="chat" ref={scrollRef}>
                {messages.length === 0 && <EmptyState settings={settings} onSnip={snip} />}
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className={`msg msg--user${m.id === focusId ? ' msg--found' : ''}`} data-msg-id={m.id}>
                      {m.app && <AppTag app={m.app} />}
                      {m.captures.length > 0 && <CaptureList captures={m.captures} />}
                      {m.files && <FileList files={m.files} />}
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
                {(captures.length > 0 || att.chips.length > 0) && (
                  <div className="context-card">
                    {captures.length > 0 && (
                      <CaptureList
                        captures={captures}
                        onRemove={(id) => {
                          setCaptures((cs) => cs.filter((c) => c.id !== id))
                          setNotice((n) => (n === 'tray-full' ? null : n))
                        }}
                        onForgetApp={(id) => setCaptures((cs) => cs.map((c) => (c.id === id ? { ...c, app: null } : c)))}
                      />
                    )}
                    {att.chips.length > 0 && <FileTray chips={att.chips} onRemove={att.remove} />}
                    {captures.length > 0 && captures.length < MAX_CAPTURES && (
                      <div className="tray-hint">
                        <Icon name="plus" /> To add more, highlight or snip, then press{' '}
                        <kbd>{prettyKey(settings.askHotkey)}</kbd>
                      </div>
                    )}
                    {actions.length > 0 && <QuickActions items={actions} disabled={busy} onPick={(a) => send('', true, a)} />}
                  </div>
                )}
                <div className="composer__row">
                  <button className="composer__tool" title="Snap part of my screen" onClick={snip} disabled={busy}>
                    <Icon name="scissors" />
                  </button>
                  <button className="composer__tool" title="Attach files" onClick={att.pick} disabled={busy}>
                    <Icon name="clip" />
                  </button>
                  <textarea
                    ref={inputRef}
                    className="composer__input"
                    rows={1}
                    placeholder={
                      captures.length > 1
                        ? 'Ask about these…'
                        : captures.length
                          ? 'Ask about this…'
                          : att.chips.length
                            ? 'Ask about your files…'
                            : 'Ask Otty anything…'
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onPaste={(e) => {
                      // A file copied in Finder pastes as a file, not text.
                      if (!e.clipboardData.files.length) return
                      e.preventDefault()
                      att.drop([...e.clipboardData.files])
                    }}
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
                    <button
                      className="send-btn"
                      title="Send"
                      disabled={(!input.trim() && !captures.length && !att.ready.length) || att.reading}
                      onClick={() => send(input)}
                    >
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

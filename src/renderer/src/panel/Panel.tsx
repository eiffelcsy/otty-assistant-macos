import { suggestionsFor } from '../../../shared/suggestions'
import { HealthBanner } from './HealthBanner'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnswerLanguage, AppInfo, Capture, EditDraft, LogView, PanelOpenPayload, PublicSettings } from '../../../shared/types'
import { addCapture, MAX_CAPTURES } from '../../../shared/captures'
import { FileList, FileTray } from '../components/FileChips'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'
import { LanguagePill } from '../components/LanguagePill'
import { MessageBox } from '../components/MessageBox'
import { useDraft } from '../lib/useDraft'
import { actionsForTray, QuickActions, type ActionItem } from '../components/QuickActions'
import { againOffer } from '../lib/again'
import { prettyKey } from '../lib/keys'
import { useAttachments } from '../lib/useAttachments'
import { useChat, type UiMessage } from '../lib/useChat'
import { serviceAt, serviceById } from '../../../shared/services'
import { AskContext, HomeContext } from './Markdown'
import { Logbook } from './logbook/Logbook'
import { History } from './History'
import { AppTag, AssistantMessage, CaptureList, HiddenLine, sourceFor } from './Messages'
import { FindBar } from './FindBar'
import { Onboarding } from './Onboarding'
import { Settings, type SectionId } from './settings/Settings'
import { Notebook } from './Notebook'

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
  reattach: { title: 'Attach your files again', body: 'Files aren’t kept with a question, so add them again with the paperclip if this one needs them.' },
  'tray-full': {
    title: `Otty can look at ${MAX_CAPTURES} things at once`,
    body: 'Remove one with its ✕ to add another, or ask about these first.'
  }
}

const TITLES: Partial<Record<string, string>> = { history: 'Recent chats', logbook: 'Logbook', settings: 'Settings', notebook: 'Notebook' }

export function Panel() {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [view, setView] = useState<'chat' | 'settings' | 'onboarding' | 'history' | 'logbook' | 'notebook'>('chat')
  /** The Settings section on show; null is the list of sections. */
  const [settingsAt, setSettingsAt] = useState<SectionId | null>(null)
  /** Which Logbook view to open on; the header button opens Everything. */
  const [logView, setLogView] = useState<LogView>('all')
  /** How many things need the user, from the Logbook's own Needs you view, so the dot and the view can't disagree. */
  const [needsYou, setNeedsYou] = useState(0)
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
  /** Bumped to scroll Settings to what Otty knows. */
  const { messages, busy, setBusy, waitingFirstToken, focusId, learn, asking, draft } = useChat(() => {
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
  const lastAnswerId = [...messages].reverse().find((m) => m.role === 'assistant')?.id

  /** Edit question (D-36): the question and its captures back in the box, ready to change and send. */
  const editQuestion = (draft: EditDraft) => {
    setInput(draft.text)
    setCaptures(draft.captures)
    setNotice(draft.files.length ? 'reattach' : null)
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0)
  }
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
    return window.otty.onSettings(setSettings)
  }, [])

  useEffect(() => {
    const count = () => void window.otty.logbook('wait', '').then((p) => setNeedsYou(p.views.find((v) => v.view === 'wait')?.count ?? 0))
    count()
    return window.otty.onLogbook(count)
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
        if (p.notice === 'open-settings') {
          setSettingsAt(null)
          return setView('settings')
        }
        if (p.notice === 'open-activity') {
          setLogView('all')
          return setView('logbook')
        }
        if (p.notice === 'open-memory') return setView('notebook')
        take(p, !!p.add)
        setView((v) => (v === 'history' || v === 'logbook' ? 'chat' : v))
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50)
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

  // Follow the conversation, unless a search result asked to show one message or the find bar is open. Scrolling up
  // while an answer streams stops following until "New text" or a scroll back to the end (D-62); a new question
  // always follows.
  const following = useRef(true)
  const [away, setAway] = useState(false)
  const askedCount = useRef(0)
  useEffect(() => {
    if (findingRef.current !== null) return
    const found = focusId && scrollRef.current?.querySelector(`[data-msg-id="${CSS.escape(focusId)}"]`)
    // A new question since last time, even if its answer arrived in the same render.
    const questions = messages.filter((m) => m.role === 'user').length
    const asked = questions > askedCount.current
    askedCount.current = questions
    if (!found && !asked && !following.current) return
    following.current = !found
    if (found) found.scrollIntoView({ block: 'center' })
    else scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, focusId, view])
  const catchUp = () => {
    following.current = true
    setAway(false)
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  // Something that grows after its answer arrived (a drawing renders lazily) mustn't push the end of the chat off
  // screen: keep following until the person scrolls away by hand (Otty's own glides never count), and again once they
  // scroll back to the end.
  useEffect(() => {
    const chat = scrollRef.current
    if (!chat || typeof ResizeObserver === 'undefined') return
    let height = chat.scrollHeight
    let view = chat.clientHeight
    // The chat grew, or got shorter because the box below it grew (a capture in the tray): either way, a chat that's
    // following stays at its end, so the latest words never hide behind the box.
    const grew = new ResizeObserver(() => {
      const moved = chat.scrollHeight > height || chat.clientHeight !== view
      if (moved && following.current && findingRef.current === null) chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' })
      height = chat.scrollHeight
      view = chat.clientHeight
    })
    for (const el of chat.children) grew.observe(el)
    grew.observe(chat)
    let byHand = false
    const hand = () => (byHand = true)
    const settled = () => {
      if (byHand) following.current = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 8
      if (byHand) setAway(!following.current)
      byHand = false
    }
    const events = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const
    for (const e of events) chat.addEventListener(e, hand, { passive: true })
    chat.addEventListener('scrollend', settled)
    return () => {
      grew.disconnect()
      for (const e of events) chat.removeEventListener(e, hand)
      chat.removeEventListener('scrollend', settled)
    }
  }, [messages, view])

  // The box's words live in main per chat (D-62): typing saves them, and a chat opening or the quick view typing brings them here.
  const keep = useDraft()
  const type = (text: string) => {
    setInput(text)
    keep.save(text)
  }
  const [draftSeen, setDraftSeen] = useState(draft.n)
  if (draft.n !== draftSeen) {
    setDraftSeen(draft.n)
    setInput(draft.text)
  }

  const actions = settings && !att.reading ? actionsForTray(captures, att.ready, settings.homeLanguage, { app, readsPages: settings.readsPages }) : []

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
      keep.drop()
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
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  // The panel's own scissors always add to the tray.
  const snip = async () => take(await window.otty.captureScreenshot(), true)

  // The words in the box were saved to the old chat as it lost focus; the new one starts empty.
  const newChat = () => {
    keep.drop()
    setInput('')
    void window.otty.resetChat()
  }
  const again = againOffer(messages, settings?.homeLanguage ?? null, busy)

  if (!settings) return <div className="panel" />

  /** Settings and the Notebook it opens: the header's Settings button takes you back to the chat. */
  const inSettings = view === 'settings' || view === 'notebook'
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
    <AskContext.Provider value={(t, action) => send(t, false, action ? { label: t, action } as ActionItem : undefined)}>
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
            <div className="panel__title">{TITLES[view] ?? 'Otty'}</div>
            <div className="panel__actions">
              <button
                className="icon-btn icon-btn--dot"
                title={view === 'logbook' ? 'Back to chat' : 'Logbook'}
                aria-label={view === 'logbook' ? 'Back to chat' : needsYou ? `Logbook, ${needsYou} needs you` : 'Logbook'}
                onClick={() => {
                  setLogView('all')
                  setView(view === 'logbook' ? 'chat' : 'logbook')
                }}
              >
                <Icon name={view === 'logbook' ? 'comment-alt' : 'journal-alt'} />
                {view !== 'logbook' && needsYou > 0 && <span className="icon-btn__dot" />}
              </button>
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
              {view === 'chat' && messages.length > 0 && settings.learn && (
                <button
                  className={`icon-btn${learn ? '' : ' icon-btn--on'}`}
                  title={learn ? 'Don’t learn from this chat' : 'Otty isn’t learning from this chat. Press to let it'}
                  aria-pressed={!learn}
                  onClick={() => void window.otty.setChatLearn(!learn)}
                >
                  <Icon name={learn ? 'brain' : 'eye-crossed'} />
                </button>
              )}
              {view === 'chat' && messages.length > 0 && (
                <button className="icon-btn" title="New chat" onClick={newChat}>
                  <Icon name="comment-medical" />
                </button>
              )}
              <button
                className="icon-btn"
                title={inSettings ? 'Back to chat' : 'Settings'}
                onClick={() => {
                  setSettingsAt(null)
                  setView(inSettings ? 'chat' : 'settings')
                }}
              >
                <Icon name={inSettings ? 'comment-alt' : 'settings'} />
              </button>
              <button className="icon-btn" title="Close (Esc)" onClick={() => window.otty.closePanel()}>
                <Icon name="cross-small" />
              </button>
            </div>
          </header>

          {view === 'settings' ? (
            <Settings
              settings={settings}
              onSaved={setSettings}
              section={settingsAt}
              onSection={setSettingsAt}
              onOpenNotebook={() => setView('notebook')}
              onOpenLogbook={(tab) => {
                setLogView(tab)
                setView('logbook')
              }}
            />
          ) : view === 'notebook' ? (
            <Notebook
              onOpenChat={() => setView('chat')}
              onBack={() => {
                setSettingsAt('privacy')
                setView('settings')
              }}
            />
          ) : view === 'logbook' ? (
            <Logbook key={logView} startView={logView} onOpenChat={(id) => void (id ? window.otty.openChat(id) : Promise.resolve()).then(() => setView('chat'))} />
          ) : view === 'history' ? (
            <History onOpen={() => setView('chat')} focusSearch={searchFocus} keep={settings.keepChats} />
          ) : (
            <>
              {finding !== null && (
                <FindBar chat={scrollRef} messages={messages} focus={finding} onClose={() => setFinding(null)} />
              )}
              <HealthBanner
                settings={settings}
                onOpenSettings={(section) => {
                  setSettingsAt(section)
                  setView('settings')
                }}
              />
              <div className="chat" ref={scrollRef}>
                {messages.length === 0 && (
                  <EmptyState
                    settings={settings}
                    app={app?.name ?? captures[0]?.app?.name ?? null}
                    onSuggest={(text) => {
                      setInput(text)
                      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0)
                    }}
                  />
                )}
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className={`msg msg--user${m.id === focusId ? ' msg--found' : ''}`} data-msg-id={m.id}>
                      {m.app && <AppTag app={m.app} />}
                      {m.captures.length > 0 && <CaptureList captures={m.captures} />}
                      {m.files && <FileList files={m.files} />}
                      <div className="msg__bubble">{m.text}</div>
                      <HiddenLine id={m.id} hidden={m.hidden} />
                    </div>
                  ) : (
                    <AssistantMessage
                      key={m.id}
                      m={m}
                      again={again?.id === m.id ? again.offer : undefined}
                      found={m.id === focusId}
                      source={sourceFor(messages, m.id)}
                      latest={m.id === lastAnswerId}
                      onEdit={editQuestion}
                      onSettings={() => {
                        setSettingsAt('conn')
                        setView('settings')
                      }}
                    />
                  )
                )}
                {waitingFirstToken && <Thinking messages={messages} service={serviceById(serviceAt(settings.baseUrl)).label} />}
              </div>
              {away && busy && (
                <button className="new-text" onClick={catchUp}>
                  <Icon name="arrow-small-down" /> New text
                </button>
              )}

              <footer className="composer">
                {notice && NOTICES[notice] && <NoticeCard notice={notice} onClose={() => setNotice(null)} />}
                {app && <AppTag app={app} onRemove={() => setApp(null)} />}
                {(captures.length > 0 || att.chips.length > 0 || actions.length > 0) && (
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
                <MessageBox
                  inputRef={inputRef}
                  value={input}
                  onChange={type}
                  onBlur={() => keep.flush(input)}
                  onSend={() => send(input)}
                  canSend={Boolean(input.trim() || actions.length) && !att.reading}
                  busy={busy}
                  onStop={() => void window.otty.stop()}
                  tools={{ onSnip: () => void snip(), onAttach: () => void att.pick() }}
                  placeholder={
                    asking
                      ? 'Or ask something else'
                      : captures.length > 1
                        ? 'Ask about these…'
                        : captures.length
                          ? 'Ask about this…'
                          : att.chips.length
                            ? 'Ask about your files…'
                            : messages.length
                              ? 'Ask a follow-up…'
                              : 'Ask Otty anything…'
                  }
                  onPaste={(e) => {
                    // A file copied in Finder pastes as a file, not text.
                    if (!e.clipboardData.files.length) return
                    e.preventDefault()
                    att.drop([...e.clipboardData.files])
                  }}
                  extra={settings.homeLanguage && <LanguagePill home={settings.homeLanguage} value={pick} onChange={setPick} disabled={busy} />}
                />
              </footer>
            </>
          )}
        </div>
      </HomeContext.Provider>
    </AskContext.Provider>
  )
}

/** Before the first word: the otter thinking, the running tool's own words, and after 6 s a line that Otty is still there. */
function Thinking({ messages, service }: { messages: UiMessage[]; service: string }) {
  const last = messages.at(-1)
  const tool = last?.role === 'assistant' ? last.tools.findLast((t) => t.status === 'running') : undefined
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6_000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="thinking" role="status">
      <Otter state="thinking" size={40} />
      <span className="thinking__words">
        <span key={tool?.label ?? ''} className={tool ? 'thinking__tool' : 'dots'}>
          {tool ? `${tool.label}…` : 'Otty is thinking'}
        </span>
        {slow && <span className="thinking__slow">Still with you. {service} is slow right now.</span>}
      </span>
    </div>
  )
}

/** Glanceable, one thing: who Otty is, the one shortcut, and up to three things to try (Spec 03, "The empty chat"). */
function EmptyState({ settings, app, onSuggest }: { settings: PublicSettings; app: string | null; onSuggest: (text: string) => void }) {
  const suggestions = suggestionsFor(app, settings.learn, settings.readsPages).slice(0, 3)
  return (
    <div className="empty">
      <Otter state="idle" size={88} />
      <h2>Hi, I’m Otty</h2>
      <p>
        Highlight anything and press <kbd>{prettyKey(settings.askHotkey)}</kbd>, or just ask below.
      </p>
      {suggestions.length > 0 && (
        <div className="try">
          <span className="try__label">Try asking</span>
          {suggestions.map((s) => (
            <button key={s.text} className="try__row" onClick={() => onSuggest(s.text)}>
              <Icon name={s.icon} />
              <span>{s.text}</span>
            </button>
          ))}
        </div>
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

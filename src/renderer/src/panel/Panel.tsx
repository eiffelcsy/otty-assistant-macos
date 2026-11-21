import { suggestionsFor } from '../../../shared/suggestions'
import { HealthBanner } from './HealthBanner'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { T, ebb, glide } from '../lib/motion'
import type { AnswerLanguage, AppInfo, Capture, EditDraft, LogView, Memory, PanelOpenPayload, PendingFile, PublicSettings, WindowGlide, WindowState } from '../../../shared/types'
import { addCapture, MAX_CAPTURES } from '../../../shared/captures'
import { FileList, FileTray } from '../components/FileChips'
import { CoveOtty } from '../components/Cove'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'
import { LanguagePill } from '../components/LanguagePill'
import { MessageBox } from '../components/MessageBox'
import { useDraft } from '../lib/useDraft'
import { actionsForTray, QuickActions, withMyTiles, type ActionItem } from '../components/QuickActions'
import { againOffer } from '../lib/again'
import { prettyKey } from '../lib/keys'
import { useAttachments } from '../lib/useAttachments'
import { useChat, type UiMessage } from '../lib/useChat'
import { serviceAt, serviceById } from '../../../shared/services'
import { AskContext, HomeContext } from './Markdown'
import { Logbook } from './logbook/Logbook'
import { History } from './History'
import { AppTag, AssistantMessage, CaptureList, HiddenLine, sourceFor, UserText } from './Messages'
import { FindBar } from './FindBar'
import { Onboarding } from './Onboarding'
import { Settings, type SectionId } from './settings/Settings'
import { Notebook } from './Notebook'
import { Home } from '../home/Home'
import { Frame, useWidth, type Place } from '../frame/Frame'
import { columns } from '../frame/bands'

type View = 'home' | 'chat' | 'settings' | 'onboarding' | 'history' | 'logbook' | 'notebook'

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
  'snip-mac-only': {
    title: 'Snipping works on macOS',
    body: 'Screen snips use the Mac’s built-in snipping tool.'
  },
  reattach: {
    title: 'Attach your files again',
    body: 'Files aren’t kept with a question, so add them again with the paperclip if this one needs them.'
  },
  'tray-full': {
    title: `Otty can look at ${MAX_CAPTURES} things at once`,
    body: 'Remove one with its ✕ to add another, or ask about these first.'
  }
}

const TITLES: Partial<Record<string, string>> = {
  home: 'Home',
  history: 'Chats',
  logbook: 'Logbook',
  settings: 'Settings',
  notebook: 'Notebook'
}

/** Once the window is at the glide's size and a frame has been drawn there, tell main (and then go on). */
/**
 * Once the window is at the glide's size, `sized` lays the panel out for it; once that's been drawn (two frames, and
 * one more to be sure it's on screen), tell main, then `then`. Nothing is laid out for a size the window isn't yet.
 */
function whenDrawn(g: WindowGlide, sized: () => void, then: () => void): void {
  const start = performance.now()
  const frame = (f: () => void) => requestAnimationFrame(() => f())
  const check = () => {
    const ok = window.innerWidth === g.width && window.innerHeight === g.height
    if (!ok && performance.now() - start < 500) return frame(check)
    sized()
    frame(() => frame(() => frame(() => (window.otty.windowGlideReady(), then()))))
  }
  check()
}

export function Panel() {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [view, setView] = useState<View>('chat')
  /** Where Back goes: the pages pushed on top of a root screen (Spec 05). Layout, so it lives here, not in main. */
  const [stack, setStack] = useState<View[]>([])
  /** ⌃⌘S folds the sidebar to the rail. */
  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null)
  /** Floating or roomy (D-65), from main; the content dims while the window moves between them. */
  const [roomy, setRoomy] = useState(false)
  /** Moving between states (Spec 06): nothing frosts or eases while the panel grows. */
  const [moving, setMoving] = useState(false)
  const width = useWidth(frameEl)
  /** The Settings section on show; null is the list of sections. */
  const [settingsAt, setSettingsAt] = useState<SectionId | null>(null)
  /** Which Logbook view to open on; the header button opens Everything. */
  const [logView, setLogView] = useState<LogView>('all')
  /** An entry to open the Logbook on, from Home (D-66). */
  const [logEntry, setLogEntry] = useState<string | undefined>()
  /** Home's own box: sending starts a new chat (Spec 06). */
  const [homeInput, setHomeInput] = useState('')
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

  /** A root screen, from the screen menu, the nav or ⌘1–⌘4: nothing to go back to. */
  const go = (to: Place) => {
    const v: View = to === 'chats' ? 'history' : to
    if (v === 'settings') setSettingsAt(null)
    if (v === 'logbook') setLogView('all')
    // Chats is a page over the chat, so Back returns to the chat.
    setStack(v === 'history' ? ['chat'] : [])
    setView(v)
  }
  /** A page on top of where the user is; Back (⌘[) returns there. */
  const push = (v: View) => {
    if (v === view) return
    setStack((s) => [...s, view])
    setView(v)
  }
  const back = () => {
    if (view === 'settings' && settingsAt) return setSettingsAt(null)
    setView(stack.at(-1) ?? 'chat')
    setStack(stack.slice(0, -1))
  }
  const openSettings = (section: SectionId | null) => {
    push('settings')
    setSettingsAt(section)
  }
  const navRef = useRef({ go, back, newChat: () => {}, attach: () => {}, help: () => {}, feed: (files: PendingFile[]) => void files })
  const roomyRef = useRef(roomy)
  useEffect(() => {
    roomyRef.current = roomy
  }, [roomy])
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
    // Main says the state on every load too: only a change is a move, and only a move fades the content out.
    let was: WindowState | null = null
    return window.otty.onWindowState((state) => {
      setRoomy(state === 'roomy')
      if (was && was !== state) setMoving(true)
      was = state
    })
  }, [])
  // Draws the move (Spec 06): main says where the window was and where it's going inside one window covering both, and
  // the panel grows from one place to the other there, its content reflowing as it goes, like a Mac window. It's placed
  // straight on the element (not through a render) before the window grows, and every step is answered once it's drawn
  // at the window's new size, so main can show the window again. Without `from`, the move has landed.
  useEffect(() => {
    let grow: Animation | null = null
    return window.otty.onWindowGlide((g) => {
      const el = frameEl
      if (!el) return window.otty.windowGlideReady()
      // The running animation holds the panel's place: it's let go only together with that place (a bare absolute
      // panel shrinks to fit at the window's top left).
      if (g.blank) {
        // Before a jump that moves the window's corner: nothing on screen, so its last picture is empty.
        return whenDrawn(g, () => (el.style.visibility = 'hidden'), () => {})
      }
      const was = grow
      grow = null
      if (g.from && g.to) {
        was?.cancel()
        const css = getComputedStyle(document.documentElement)
        const round = (floating: boolean) => css.getPropertyValue(floating ? '--radius' : '--r-sm').trim() || '0px'
        const box = (r: NonNullable<WindowGlide['from']>, floating: boolean) => ({
          left: `${r.x}px`,
          top: `${r.y}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
          borderRadius: round(floating)
        })
        const growing = g.to.width > g.from.width
        el.style.position = 'absolute'
        grow = el.animate([box(g.from, growing), box(g.to, !growing)], { duration: T.travel * 1000, easing: `cubic-bezier(${glide.join(',')})`, fill: 'both' })
        grow.pause()
        whenDrawn(g, () => (el.style.visibility = ''), () => grow?.play())
      } else {
        // Landed: back to filling the window, only once the window is its new size.
        whenDrawn(
          g,
          () => {
            was?.cancel()
            el.style.position = ''
            el.style.visibility = ''
            setMoving(false)
          },
          () => {}
        )
      }
    })
  }, [frameEl])
  // The app menu asks the window to go somewhere (D-65): the same navigation as the keys.
  useEffect(
    () =>
      window.otty.onFrameCommand((c) => {
        const nav = navRef.current
        if (c === 'new') return nav.newChat()
        if (c === 'sidebar') return setSidebarHidden((h) => !h)
        if (c === 'find') return dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true }))
        if (c === 'attach') return nav.attach()
        if (c === 'help') return nav.help()
        nav.go(c)
      }),
    []
  )

  /** What Otty knows, for Try asking: read again each time a screen opens, so a new note shows up next time. */
  const [known, setKnown] = useState<Memory[]>([])
  const learning = settings?.learn ?? false
  useEffect(() => {
    // With learning off, suggestionsFor uses none of it, so there's nothing to clear.
    if (learning) void window.otty.listMemories().then(setKnown)
  }, [learning, view])

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
        if (p.notice === 'open-settings') return navRef.current.go('settings')
        if (p.notice === 'open-activity') return navRef.current.go('logbook')
        if (p.notice === 'open-memory') return navRef.current.go('notebook')
        if (p.files?.length) return navRef.current.feed(p.files)
        take(p, !!p.add)
        setView((v) => {
          if (v !== 'history' && v !== 'logbook') return v
          setStack([])
          return 'chat'
        })
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50)
      }),
    []
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘. stops the answer, wherever the focus is (Spec 03, Keyboard); with none running, main has nothing to stop.
      if (e.key === '.' && e.metaKey) {
        e.preventDefault()
        void window.otty.stop()
        return
      }
      // The frame's keys (Spec 05): ⌘1–⌘4 screens, ⌘, Settings, ⌘N new chat, ⌘[ back, ⌃⌘S the sidebar, F6 the columns.
      const nav = navRef.current
      if (e.metaKey && !e.shiftKey && !e.altKey && settingsRef.current?.onboarded) {
        const to = ({ '1': 'home', '2': 'chat', '3': 'logbook', '4': 'notebook', ',': 'settings' } as const)[e.key as '1']
        if (to && !e.ctrlKey) {
          e.preventDefault()
          return nav.go(to)
        }
        if (e.key === 'n' && !e.ctrlKey) {
          e.preventDefault()
          return nav.newChat()
        }
        if (e.key === '[' && !e.ctrlKey) {
          e.preventDefault()
          return nav.back()
        }
        if (e.key === 's' && e.ctrlKey) {
          e.preventDefault()
          return setSidebarHidden((h) => !h)
        }
      }
      // ⇧⌘E: Expand or Shrink (Spec 06).
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        void window.otty.setWindowState(roomyRef.current ? 'shrink' : 'expand')
        return
      }
      if (e.key === 'F6') {
        e.preventDefault()
        const cols = [...document.querySelectorAll<HTMLElement>('[data-column]')]
        const at = cols.findIndex((c) => c.contains(document.activeElement))
        const next = cols[(at + (e.shiftKey ? cols.length - 1 : 1) + cols.length) % cols.length]
        next?.focus({ preventScroll: true })
        return
      }
      if (e.key === 'Escape' && !document.querySelector('.explain-card')) {
        // The first Esc only closes the find bar.
        if (findingRef.current !== null) setFinding(null)
        else window.otty.closePanel()
      }
      if (e.key.toLowerCase() !== 'f' || !e.metaKey || !settingsRef.current?.onboarded) return
      // ⌘F in a chat: find in it. ⇧⌘F, or ⌘F with nothing to find: Recent chats, with the search box focused.
      const inChat = document.querySelector('.frame__screen--chat:not([hidden]) .chat') && messagesRef.current.length > 0
      if (inChat && !e.shiftKey) {
        e.preventDefault()
        setFinding((n) => (n ?? 0) + 1)
      } else if (settingsRef.current.rememberChats) {
        e.preventDefault()
        nav.go('chats')
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
    else
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
  }, [messages, focusId, view])
  const catchUp = () => {
    following.current = true
    setAway(false)
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    })
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

  const actions =
    settings && !att.reading
      ? withMyTiles(actionsForTray(captures, att.ready, settings.homeLanguage, { app, readsPages: settings.readsPages }), settings.myTiles, captures, att.ready, app)
      : []

  /** An empty box with captures or attached files runs the first quick action. `tray` false sends the text alone. */
  const send = useCallback(
    (raw: string, tray = true, picked?: ActionItem) => {
      const item = picked ?? (!raw.trim() && tray ? actions[0] : undefined)
      const text = item ? (item.prompt ?? item.label) : raw.trim()
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
      window.otty.sendMessage(text, sent, {
        app,
        action: item?.action,
        language: pick,
        files
      })
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
    // From any screen, New chat shows the new chat, ready to type in.
    go('chat')
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0)
  }
  /** A question from Home starts a new chat and shows it, as from an empty chat. */
  const askFromHome = async () => {
    const text = homeInput.trim()
    if (!text || busy) return
    setHomeInput('')
    keep.drop()
    await window.otty.resetChat()
    go('chat')
    setBusy(true)
    void window.otty.sendMessage(text, [], { app: null })
  }

  // The keyboard and main's open requests reach the newest navigation through this ref.
  useEffect(() => {
    navRef.current = {
      go,
      back,
      newChat,
      feed: (files: PendingFile[]) => {
        newChat()
        void att.adopt(files)
      },
      attach: () => {
        go('chat')
        void att.pick()
      },
      help: () => {
        go('settings')
        setSettingsAt('help')
      }
    }
  })
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

  const chatsAsColumn = settings.rememberChats && columns(width, true).list
  // Chats is a column beside the chat when there's room, and a page over it when there isn't.
  const shown = view === 'history' && chatsAsColumn ? 'chat' : view
  const place: Place = shown === 'history' ? 'chats' : shown
  const pushed = stack.length > 0 && shown !== 'chat'
  const title = shown === 'chat' ? (messages.length ? 'Chat' : 'New chat') : TITLES[shown]!
  const onChat = shown === 'chat' && messages.length > 0
  const learnOff = onChat && settings.learn && !learn
  const toggleLearn = () => void window.otty.setChatLearn(!learn)
  const findInChat = () => setFinding((n) => (n === null ? 1 : null))
  /** The chat's own actions: in the compact screen menu, or as header buttons once there's room. */
  const menuExtras = onChat
    ? [
        { label: 'Find in this chat', icon: 'search', keys: '⌘F', onClick: findInChat },
        ...(settings.learn
          ? [{ label: learn ? 'Don’t learn from this chat' : 'Let Otty learn from this chat', icon: learn ? 'eye-crossed' : 'brain', onClick: toggleLearn }]
          : [])
      ]
    : []
  const compact = columns(width, false).nav === 'none'
  const learnButton = (
    <button
      className={`icon-btn${learn ? '' : ' icon-btn--on'}`}
      title={learn ? 'Don’t learn from this chat' : 'Otty isn’t learning from this chat. Press to let it'}
      aria-pressed={!learn}
      onClick={toggleLearn}
    >
      <Icon name={learn ? 'brain' : 'eye-crossed'} />
    </button>
  )
  // Compact keeps four icons; a chat Otty isn't learning from still says so there, since that's a state to see.
  const chatActions = compact ? (
    learnOff && learnButton
  ) : onChat ? (
    <>
      <button className="icon-btn" title="Find in this chat (⌘F)" onClick={findInChat}>
        <Icon name="search" />
      </button>
      {settings.learn && learnButton}
    </>
  ) : null

  return (
    <AskContext.Provider value={(t, action) => send(t, false, action ? ({ label: t, action } as ActionItem) : undefined)}>
      <HomeContext.Provider value={settings.homeLanguage}>
        <div className={`panel${roomy ? ' panel--roomy' : ''}${moving ? ' panel--moving' : ''}`} ref={setFrameEl} {...drop}>
          {dragging && (
            <div className="drop-veil">
              <Icon name="clip" />
              <span>Drop files to ask Otty about them</span>
            </div>
          )}
          <Frame
            width={width}
            place={place}
            title={title}
            pushed={pushed}
            onBack={back}
            onGo={go}
            needsYou={needsYou}
            status={settings.workPaused ? 'Paused' : busy ? 'Working' : needsYou ? `${needsYou} needs you` : 'All quiet'}
            busy={busy}
            paused={settings.workPaused}
            onNewChat={newChat}
            sidebarHidden={sidebarHidden}
            roomy={roomy}
            onResize={() => void window.otty.setWindowState(roomy ? 'shrink' : 'expand')}
            noChats={!settings.rememberChats}
            menuExtras={menuExtras}
            actions={chatActions}
            cove={shown === 'home' ? 'full' : shown === 'chat' ? (messages.length === 0 ? 'full' : 'wash') : undefined}
            list={shown === 'chat' && chatsAsColumn ? <History onOpen={() => go('chat')} focusSearch={searchFocus} keep={settings.keepChats} /> : undefined}
          >
            <div className="frame__screen frame__screen--chat" hidden={shown !== 'chat'}>
            {finding !== null && <FindBar chat={scrollRef} messages={messages} focus={finding} onClose={() => setFinding(null)} />}
            <HealthBanner
              settings={settings}
              onOpenSettings={(section) => openSettings(section)}
            />
            <div className={`chat${messages.length === 0 ? ' cove-scroll' : ''}`} ref={scrollRef}>
              {messages.length === 0 && (
                <EmptyState
                  settings={settings}
                  known={known}
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
                    <UserText text={m.text} />
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
                    onSettings={() => openSettings('conn')}
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
              <MessageBox
                tray={
                  (captures.length > 0 || att.chips.length > 0 || actions.length > 0) && (
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
                      {captures.length > 0 && (
                        <div className="tray-hint">
                          {captures.length < MAX_CAPTURES && (
                            <>
                              <Icon name="plus" /> To add more, highlight or snip, then press <kbd>{prettyKey(settings.askHotkey)}</kbd>
                            </>
                          )}
                          {captures.length > 1 && (
                            <span className="tray-count">
                              {captures.length} of {MAX_CAPTURES}
                            </span>
                          )}
                        </div>
                      )}
                      {actions.length > 0 && <QuickActions items={actions} disabled={busy} onPick={(a) => send('', true, a)} />}
                    </div>
                  )
                }
                inputRef={inputRef}
                value={input}
                onChange={type}
                onBlur={() => keep.flush(input)}
                onSend={() => send(input)}
                canSend={Boolean(input.trim() || actions.length) && !att.reading}
                busy={busy}
                onStop={() => void window.otty.stop()}
                paused={settings.workPaused}
                // ↑ in an empty box edits the last question, through the same card as Edit question (M13).
                onArrowUp={() => document.querySelector<HTMLButtonElement>('.msg--latest .edit-question')?.click()}
                tools={{
                  onSnip: () => void snip(),
                  onAttach: () => void att.pick()
                }}
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
                extra={
                  settings.homeLanguage && settings.homeUsed && <LanguagePill home={settings.homeLanguage} value={pick} onChange={setPick} disabled={busy} />
                }
              />
            </footer>
            </div>
            {shown === 'settings' && (
              <Settings
                settings={settings}
                onSaved={setSettings}
                section={settingsAt}
                onSection={setSettingsAt}
                onOpenNotebook={() => push('notebook')}
                onOpenLogbook={(tab) => {
                  setLogView(tab)
                  push('logbook')
                }}
              />
            )}
            {shown === 'notebook' && (
              <Notebook
                onOpenChat={() => go('chat')}
                onBack={
                  stack.at(-1) === 'settings'
                    ? () => {
                        setSettingsAt('privacy')
                        back()
                      }
                    : undefined
                }
              />
            )}
            {shown === 'logbook' && (
              <Logbook key={`${logView}:${logEntry ?? ''}`} startView={logView} startEntry={logEntry} onOpenChat={(id) => void (id ? window.otty.openChat(id) : Promise.resolve()).then(() => go('chat'))} />
            )}
            {shown === 'history' && <History onOpen={() => go('chat')} focusSearch={searchFocus} keep={settings.keepChats} />}
            {shown === 'home' && (
              <div className="frame__screen">
                <Home
                  onOpenChat={(id) => void (id ? window.otty.openChat(id) : Promise.resolve()).then(() => go('chat'))}
                  onOpenEntry={(id) => {
                    setLogView('all')
                    setLogEntry(id)
                    push('logbook')
                  }}
                  onOpenLogbook={(v) => {
                    setLogView(v)
                    setLogEntry(undefined)
                    push('logbook')
                  }}
                  onSuggest={(text) => setHomeInput(text)}
                  suggestions={suggestionsFor(null, settings.learn, settings.readsPages, known).map((s) => s.text)}
                />
                <footer className="composer">
                  <MessageBox
                    value={homeInput}
                    onChange={setHomeInput}
                    onSend={() => void askFromHome()}
                    canSend={Boolean(homeInput.trim())}
                    paused={settings.workPaused}
                    placeholder="Ask Otty anything, or give it something to look after"
                    label="Ask Otty"
                  />
                </footer>
              </div>
            )}
          </Frame>
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
        {/* S2: one line ebbs before the next surfaces, so two never overlap. */}
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={tool?.label ?? ''}
            className={tool ? 'thinking__tool' : 'dots'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: T.quick, ease: glide } }}
            exit={{ opacity: 0, y: -3, transition: { duration: 0.14, ease: ebb } }}
          >
            {tool ? `${tool.label}…` : 'Otty is thinking'}
          </m.span>
        </AnimatePresence>
        {slow && <span className="thinking__slow">Still with you. {service} is slow right now.</span>}
      </span>
    </div>
  )
}

/** Glanceable, one thing: who Otty is, the one shortcut, and up to three things to try (Spec 03, "The empty chat"). */
function EmptyState({ settings, known, app, onSuggest }: { settings: PublicSettings; known: Memory[]; app: string | null; onSuggest: (text: string) => void }) {
  const suggestions = suggestionsFor(app, settings.learn, settings.readsPages, known).slice(0, 3)
  return (
    <div className="empty">
      {/* The same cove as Home, full bleed (D-74, Spec 07): the words on the sky, Otty in the water. */}
      <div className="cove-hero">
        <div className="cove-hero__words">
          <h2 className="cove-hero__hello">Hi, I’m Otty</h2>
          <p className="cove-hero__sentence">
            Highlight anything and press <kbd>{prettyKey(settings.askHotkey)}</kbd>, or just ask below.
          </p>
        </div>
        <CoveOtty />
      </div>
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

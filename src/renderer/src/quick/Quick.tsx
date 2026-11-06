import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AnswerLanguage, AppInfo, Capture, HomeLanguage, PanelOpenPayload } from '../../../shared/types'
import { addCapture, MAX_CAPTURES } from '../../../shared/captures'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'
import { LanguagePill } from '../components/LanguagePill'
import { actionsForTray, type ActionItem } from '../components/QuickActions'
import { prettyKey } from '../lib/keys'
import { againOffer } from '../lib/again'
import { useChat } from '../lib/useChat'
import { AskContext, HomeContext } from '../panel/Markdown'
import { AppTag, AssistantMessage, CaptureList, sourceFor } from '../panel/Messages'

/** Leaves room under a short answer for an explain-term card to open into. */
const POPOVER_ROOM = 320
/** Transparent margin around the card so its shadow isn't clipped (matches .quick padding). */
const MARGIN = 12

/**
 * The little ask-at-your-cursor card opened by the hotkeys: ask → answer → Esc or continue in the full chat.
 * Before asking it can collect up to four captures: main sends each new one with `add` while it's open and unfocused.
 */
export function Quick() {
  const [captures, setCaptures] = useState<Capture[]>([])
  /** The app the user was in, when nothing was captured. */
  const [app, setApp] = useState<AppInfo | null>(null)
  /** "＋ Add more" was pressed: stay open while the user goes to other apps. */
  const [pinned, setPinned] = useState(false)
  const [full, setFull] = useState(false)
  const [askHotkey, setAskHotkey] = useState('')
  const [question, setQuestion] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [popover, setPopover] = useState(false)
  const [opened, setOpened] = useState(0)
  const [home, setHome] = useState<HomeLanguage | null>(null)
  const [readsPages, setReadsPages] = useState(false)
  const [pick, setPick] = useState<AnswerLanguage | undefined>()
  const [learning, setLearning] = useState(false)
  const { messages, busy, waitingFirstToken, clear, learn } = useChat()
  const cardRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)
  const answerBodyRef = useRef<HTMLDivElement>(null)

  const capturesRef = useRef(captures)
  capturesRef.current = captures
  const askedRef = useRef(false)

  useEffect(
    () =>
      window.otty.onQuickOpen((p: PanelOpenPayload) => {
        if (p.add && !askedRef.current && p.context) {
          const r = addCapture(capturesRef.current, p.context, p.app ?? null, crypto.randomUUID())
          if (r.ok) {
            capturesRef.current = r.captures
            setCaptures(r.captures)
          }
          setFull(!r.ok && r.reason === 'full')
          return
        }
        clear()
        window.otty.getSettings().then((s) => {
          setHome(s.homeLanguage)
          setReadsPages(s.readsPages)
          setLearning(s.learn)
          setAskHotkey(s.askHotkey)
        })
        setCaptures(p.context ? [{ id: crypto.randomUUID(), context: p.context, app: p.app ?? null }] : [])
        setApp(p.context ? null : (p.app ?? null))
        setPinned(false)
        setFull(false)
        setQuestion(null)
        setInput('')
        setPick(undefined)
        setOpened((n) => n + 1) // re-report our size even if it hasn't changed, so main can reveal us
        setTimeout(() => inputRef.current?.focus(), 30)
      }),
    []
  )

  const asked = question !== null
  askedRef.current = asked

  // Main needs to know whether a hotkey should add to us, and whether a click elsewhere should put us away.
  useEffect(() => {
    window.otty.quickState({ collecting: !asked, pinned: !asked && pinned })
  }, [asked, pinned, opened])
  const answers = messages.filter((m) => m.role === 'assistant')
  const again = againOffer(messages, home, busy)

  /**
   * ↵ with an empty box runs the first quick action: the meaning for a single word, a simple explanation
   * for one capture, Compare for several.
   */
  const fallback = actionsForTray(captures, [], home, { app, readsPages })[0]
  const proofread = actionsForTray(captures, [], home).find((a) => a.action === 'proofread')
  const ask = (picked?: ActionItem) => {
    const item = picked ?? (input.trim() ? undefined : fallback)
    const text = item ? item.label : input.trim()
    if (!text) return
    setQuestion(text)
    setFull(false)
    window.otty.sendMessage(text, captures, { app, fresh: true, action: item?.action, language: pick })
  }

  const close = () => window.otty.closeQuick()
  const expand = () => window.otty.expandQuick()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!document.querySelector('.explain-card')) close()
        return
      }
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement
      if (e.key === 'Enter' && asked && !typing && !e.isComposing) {
        e.preventDefault()
        expand()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [asked])

  // Grow the window when an explain card pops open, so it has somewhere to go.
  useEffect(() => {
    const mo = new MutationObserver(() => setPopover(!!document.querySelector('.explain-card')))
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])

  // Tell main how tall we'd like to be; main reveals the window on the first report after opening.
  // The card is capped to the window, so a squeezed answer reports the height it wants, not the one it got.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const report = () => {
      const answer = answerRef.current
      const body = answerBodyRef.current
      const squeezed =
        answer && body ? Math.min(body.offsetHeight, parseFloat(getComputedStyle(answer).maxHeight)) - answer.clientHeight : 0
      // Measure to the last row, not offsetHeight: when the window is still the last (smaller) size,
      // the rest of the card overflows the cap, and offsetHeight would only report the cap back.
      // (offsetTop rather than getBoundingClientRect, which the opening pop animation scales.)
      const last = card.lastElementChild as HTMLElement | null
      const cs = getComputedStyle(card)
      const lastTop = !last ? 0 : last.offsetParent === card ? last.offsetTop + card.clientTop : last.offsetTop - card.offsetTop
      const natural = last
        ? lastTop + last.offsetHeight + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth)
        : card.offsetHeight
      const wanted = natural + Math.max(0, squeezed)
      window.otty.quickResize(Math.ceil(Math.max(wanted, popover ? POPOVER_ROOM : 0)) + MARGIN * 2)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(card)
    // A capped card keeps its size while its contents grow, so watch the rows themselves too.
    for (const row of Array.from(card.children)) ro.observe(row)
    if (answerBodyRef.current) ro.observe(answerBodyRef.current)
    return () => ro.disconnect()
  }, [popover, opened, asked])

  useEffect(() => {
    answerRef.current?.scrollTo({ top: answerRef.current.scrollHeight })
  }, [messages])

  return (
    <AskContext.Provider
      value={(t, action) => {
        window.otty.sendMessage(t, [], action ? { action } : undefined)
        expand()
      }}
    >
      <HomeContext.Provider value={home}>
        <div className="quick">
          <div className="quick__card" ref={cardRef}>
            <div className="quick__ask">
              <Otter state={busy ? 'thinking' : asked && !busy ? 'happy' : 'idle'} size={34} />
              <div className="quick__box">
                {app && <AppTag app={app} onRemove={asked ? undefined : () => setApp(null)} />}
                {captures.length > 0 && (
                  <CaptureList
                    captures={captures}
                    compact
                    onRemove={asked || captures.length < 2 ? undefined : (id) => setCaptures((cs) => cs.filter((c) => c.id !== id))}
                    onForgetApp={
                      asked ? undefined : (id) => setCaptures((cs) => cs.map((c) => (c.id === id ? { ...c, app: null } : c)))
                    }
                  />
                )}
                {!asked && (pinned || full) && (
                  <div className="tray-hint">
                    {full ? (
                      <>Otty can look at {MAX_CAPTURES} things at once. Ask about these first.</>
                    ) : (
                      <>
                        <Icon name="plus" /> Highlight or snip more, then press <kbd>{prettyKey(askHotkey)}</kbd>
                      </>
                    )}
                  </div>
                )}
                {asked ? (
                  <div className="quick__question">{question}</div>
                ) : (
                  <textarea
                    ref={inputRef}
                    className="quick__input"
                    rows={1}
                    placeholder={
                      fallback?.action === 'read-page'
                        ? 'Ask about this page, or press ↵ to summarize it'
                        : fallback?.action === 'define'
                          ? 'Ask about this, or press ↵ for its meaning'
                          : captures.length > 1
                            ? 'Ask about these, or press ↵ to compare them'
                            : captures.length
                              ? 'Ask about this, or press ↵ to explain it'
                              : 'Ask Otty anything…'
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        ask()
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {asked && (
              <div className="quick__answer" ref={answerRef}>
                <div className="quick__answer-body" ref={answerBodyRef}>
                  {answers.map((m) => (
                    <AssistantMessage key={m.id} m={m} again={again?.id === m.id ? again.offer : undefined} source={sourceFor(messages, m.id)} />
                  ))}
                  {waitingFirstToken && (
                    <div className="thinking">
                      <span className="dots">Otty is thinking</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="quick__hint">
              <button className="quick__key" onClick={close}>
                <kbd>esc</kbd> close
              </button>
              {asked ? (
                <span className="quick__go">
                  {learning && (
                    <button
                      className={`quick__key${learn ? '' : ' quick__key--on'}`}
                      title={learn ? 'Otty won’t learn anything from this chat' : 'Let Otty learn from this chat'}
                      aria-pressed={!learn}
                      onClick={() => void window.otty.setChatLearn(!learn)}
                    >
                      <Icon name="eye-crossed" /> don’t learn
                    </button>
                  )}
                  <button className="quick__key quick__key--go" onClick={expand}>
                    <kbd>↵</kbd> continue in chat <Icon name="arrow-small-right" />
                  </button>
                </span>
              ) : (
                <span className="quick__go">
                  {captures.length > 0 && captures.length < MAX_CAPTURES && (
                    <button
                      className={`quick__key${pinned ? ' quick__key--on' : ''}`}
                      title="Keep this open while you highlight or snip in other apps"
                      onClick={() => setPinned((on) => !on)}
                    >
                      <Icon name="plus" /> add more
                    </button>
                  )}
                  {proofread && (
                    <button className="quick__key" title="Fix mistakes and explain each one" onClick={() => ask(proofread)}>
                      <Icon name="pencil" /> check writing
                    </button>
                  )}
                  {home && <LanguagePill home={home} value={pick} onChange={setPick} />}
                  <button className="quick__key quick__key--go" onClick={() => ask()} disabled={!input.trim() && !fallback}>
                    <kbd>↵</kbd> ask Otty
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      </HomeContext.Provider>
    </AskContext.Provider>
  )
}

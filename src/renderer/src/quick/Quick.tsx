import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AppInfo, PanelOpenPayload, ScreenContext } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'
import { useChat } from '../lib/useChat'
import { AskContext } from '../panel/Markdown'
import { AppTag, AssistantMessage, ContextPreview } from '../panel/Messages'

/** Leaves room under a short answer for an explain-term card to open into. */
const POPOVER_ROOM = 320
/** Transparent margin around the card so its shadow isn't clipped (matches .quick padding). */
const MARGIN = 12

/** The little ask-at-your-cursor card opened by the hotkeys: ask → answer → Esc or continue in the full chat. */
export function Quick() {
  const [context, setContext] = useState<ScreenContext | null>(null)
  const [app, setApp] = useState<AppInfo | null>(null)
  const [question, setQuestion] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [popover, setPopover] = useState(false)
  const [opened, setOpened] = useState(0)
  const { messages, busy, waitingFirstToken, clear } = useChat()
  const cardRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      window.otty.onQuickOpen((p: PanelOpenPayload) => {
        clear()
        setContext(p.context)
        setApp(p.app ?? null)
        setQuestion(null)
        setInput('')
        setOpened((n) => n + 1) // re-report our size even if it hasn't changed, so main can reveal us
        setTimeout(() => inputRef.current?.focus(), 30)
      }),
    []
  )

  const asked = question !== null
  const answers = messages.filter((m) => m.role === 'assistant')

  const ask = () => {
    const text = input.trim() || (context ? 'Explain this simply.' : '')
    if (!text) return
    setQuestion(text)
    window.otty.sendMessage(text, context, { app, fresh: true })
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

  // Tell main how tall we are; main reveals the window on the first report after opening.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const report = () => window.otty.quickResize(Math.ceil(Math.max(card.offsetHeight, popover ? POPOVER_ROOM : 0)) + MARGIN * 2)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(card)
    return () => ro.disconnect()
  }, [popover, opened])

  useEffect(() => {
    answerRef.current?.scrollTo({ top: answerRef.current.scrollHeight })
  }, [messages])

  return (
    <AskContext.Provider
      value={(t) => {
        window.otty.sendMessage(t, null)
        expand()
      }}
    >
      <div className="quick">
        <div className="quick__card" ref={cardRef}>
          <div className="quick__ask">
            <Otter state={busy ? 'thinking' : asked && !busy ? 'happy' : 'idle'} size={34} />
            <div className="quick__box">
              {app && <AppTag app={app} onRemove={asked ? undefined : () => setApp(null)} />}
              {context && <ContextPreview ctx={context} compact />}
              {asked ? (
                <div className="quick__question">{question}</div>
              ) : (
                <textarea
                  ref={inputRef}
                  className="quick__input"
                  rows={1}
                  placeholder={context ? 'Ask about this, or press ↵ to explain it' : 'Ask Otty anything…'}
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
              {answers.map((m) => (
                <AssistantMessage key={m.id} m={m} />
              ))}
              {waitingFirstToken && (
                <div className="thinking">
                  <span className="dots">Otty is thinking</span>
                </div>
              )}
            </div>
          )}

          <div className="quick__hint">
            <button className="quick__key" onClick={close}>
              <kbd>esc</kbd> close
            </button>
            {asked ? (
              <button className="quick__key quick__key--go" onClick={expand}>
                <kbd>↵</kbd> continue in chat <Icon name="arrow-small-right" />
              </button>
            ) : (
              <button className="quick__key quick__key--go" onClick={ask} disabled={!input.trim() && !context}>
                <kbd>↵</kbd> ask Otty
              </button>
            )}
          </div>
        </div>
      </div>
    </AskContext.Provider>
  )
}

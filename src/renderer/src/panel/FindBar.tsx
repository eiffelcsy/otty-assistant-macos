import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon } from '../components/Icon'
import { findInChat, paintMatches } from '../lib/findInChat'

/** Find in this chat (D-7): a bar above the conversation that highlights and steps through matches. */
export function FindBar({
  chat,
  messages,
  focus,
  onClose
}: {
  /** The scrolling chat; its `[data-msg-id]` children are searched. */
  chat: RefObject<HTMLDivElement | null>
  /** Changes whenever the conversation does, so streamed answers are searched too. */
  messages: unknown
  /** Bumped to focus the field again (⌘F while the bar is open). */
  focus: number
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Range[]>([])
  const [current, setCurrent] = useState(0)
  /** Set when the current match should be scrolled to: a new query or a step, not a streamed token. */
  const jump = useRef<'first' | 'current' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focus])

  useEffect(() => {
    jump.current = 'first'
  }, [query])

  useEffect(() => {
    const t = setTimeout(() => {
      const found = chat.current ? findInChat(chat.current, query) : []
      setMatches(found)
      if (jump.current === 'first') {
        // Like a browser: start at the first match that's on screen or below it.
        const top = chat.current?.getBoundingClientRect().top ?? 0
        const i = found.findIndex((r) => r.getBoundingClientRect().bottom >= top)
        setCurrent(Math.max(0, i))
        jump.current = 'current'
      } else {
        setCurrent((c) => Math.min(c, Math.max(0, found.length - 1)))
      }
    }, 80)
    return () => clearTimeout(t)
  }, [query, messages, chat])

  useEffect(() => {
    paintMatches(matches, current)
    const r = matches[current]
    const box = chat.current
    if (jump.current === 'current' && r && box) {
      jump.current = null
      const at = r.getBoundingClientRect()
      const view = box.getBoundingClientRect()
      if (at.top < view.top + 40 || at.bottom > view.bottom - 40) {
        box.scrollBy({ top: at.top - view.top - view.height / 2, behavior: 'smooth' })
      }
    }
  }, [matches, current, chat])

  useEffect(() => () => paintMatches(), [])

  const step = (by: number) => {
    if (!matches.length) return
    jump.current = 'current'
    setCurrent((c) => (c + by + matches.length) % matches.length)
  }

  const searching = query.trim() !== ''
  return (
    <div className="find-bar">
      <label className="find-bar__field">
        <Icon name="search" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Find in this chat"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              step(e.shiftKey ? -1 : 1)
            }
          }}
        />
        {searching && (
          <span className="find-bar__count" aria-live="polite">
            {matches.length ? `${current + 1} of ${matches.length}` : 'No matches'}
          </span>
        )}
      </label>
      <button className="icon-btn" title="Previous (⇧↵)" disabled={!matches.length} onClick={() => step(-1)}>
        <Icon name="angle-small-up" />
      </button>
      <button className="icon-btn" title="Next (↵)" disabled={!matches.length} onClick={() => step(1)}>
        <Icon name="angle-small-down" />
      </button>
      <button className="icon-btn" title="Close (Esc)" onClick={onClose}>
        <Icon name="cross-small" />
      </button>
    </div>
  )
}

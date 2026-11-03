import { useEffect, useRef, useState } from 'react'
import type { ChatSearchHit, ChatSummary, KeepChats } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'

function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** The snippet with its matches wrapped in <mark>. */
function Snippet({ snippet }: { snippet: ChatSearchHit['snippet'] }) {
  const parts: React.ReactNode[] = []
  let at = 0
  snippet.ranges.forEach(([s, e], i) => {
    parts.push(snippet.text.slice(at, s), <mark key={i}>{snippet.text.slice(s, e)}</mark>)
    at = e
  })
  parts.push(snippet.text.slice(at))
  return <span className="history__snippet">{parts}</span>
}

/** Saved chats, newest first, with a search box. Opening one swaps it into the chat view. */
const KEPT: Record<KeepChats, string> = {
  '30d': 'Otty keeps chats for 30 days on this Mac.',
  '1y': 'Otty keeps chats for a year on this Mac.',
  forever: 'Otty keeps your chats on this Mac until you forget them.'
}

export function History({ onOpen, focusSearch, keep }: { onOpen: () => void; focusSearch: number; keep: KeepChats }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const latest = useRef(0)

  useEffect(() => {
    window.otty.listChats().then(setChats)
  }, [])

  useEffect(() => {
    searchRef.current?.focus()
  }, [focusSearch, chats !== null])

  // Search as you type; an answer to an older keystroke is dropped.
  useEffect(() => {
    const id = ++latest.current
    if (!query.trim()) return setHits(null)
    const timer = setTimeout(async () => {
      const found = await window.otty.searchChats(query)
      if (id === latest.current) setHits(found)
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  const open = async (id: string, messageId?: string) => {
    await window.otty.openChat(id, messageId)
    onOpen()
  }

  if (!chats) return <div className="history" />

  if (!chats.length) {
    return (
      <div className="history">
        <div className="empty">
          <Otter state="idle" size={72} />
          <h2>No chats yet</h2>
          <p>Your conversations with Otty will show up here, so you can pick them up again later.</p>
        </div>
      </div>
    )
  }

  const searching = query.trim() !== ''

  return (
    <div className="history">
      <label className="history__search">
        <Icon name="search" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search your chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.stopPropagation() // the first Esc only clears the search
              setQuery('')
            }
          }}
        />
      </label>

      {searching ? (
        hits?.length === 0 ? (
          <p className="hint history__none">No chats mention “{query.trim()}”</p>
        ) : (
          hits?.map((h) => (
            <div key={h.chatId} className="history__item">
              <button className="history__open" onClick={() => open(h.chatId, h.messageId)}>
                <span className="history__title">{h.title}</span>
                {h.snippet.text && <Snippet snippet={h.snippet} />}
                <span className="history__meta">
                  {h.app && <>{h.app} · </>}
                  {ago(h.updatedAt)}
                </span>
              </button>
            </div>
          ))
        )
      ) : (
        <>
          {chats.map((c) => (
            <div key={c.id} className="history__item">
              <button className="history__open" onClick={() => open(c.id)}>
                <span className="history__title">{c.title}</span>
                <span className="history__meta">
                  {c.app && <>{c.app} · </>}
                  {ago(c.updatedAt)}
                </span>
              </button>
              <button
                className="icon-btn history__delete"
                title="Forget this chat"
                onClick={async () => {
                  await window.otty.deleteChat(c.id)
                  setChats((cs) => cs!.filter((x) => x.id !== c.id))
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
          <p className="hint history__note">
            {KEPT[keep]} Pictures are never saved.{chats.length >= 500 && ' Search finds older ones.'}
          </p>
        </>
      )}
    </div>
  )
}

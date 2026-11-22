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

/** Asks before forgetting one or more chats. Esc and Cancel close it without forgetting. */
function ForgetDialog({
  count,
  title,
  onConfirm,
  onClose
}: {
  count: number
  title?: string
  onConfirm: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current!.showModal()
  }, [])

  useEffect(() => {
    const d = ref.current!
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [onClose])

  const one = count === 1
  return (
    <dialog ref={ref} className="forget-dialog" aria-labelledby="forget-title">
      <h2 id="forget-title" className="forget-dialog__title">
        {one ? `Forget “${title ?? 'this chat'}”?` : `Forget ${count} chats?`}
      </h2>
      <p className="hint">Otty will forget {one ? 'it' : 'them'} for good. This can’t be undone.</p>
      <div className="forget-dialog__actions">
        <button className="btn btn--soft" autoFocus onClick={() => ref.current?.close()}>
          Cancel
        </button>
        <button className="btn btn--warn" onClick={onConfirm}>
          Forget
        </button>
      </div>
    </dialog>
  )
}

/** Saved chats, newest first, with a search box. Opening one swaps it into the chat view. */
const KEPT: Record<KeepChats, string> = {
  '30d': 'Otty keeps chats for 30 days on this Mac.',
  '1y': 'Otty keeps chats for a year on this Mac.',
  forever: 'Otty keeps your chats on this Mac until you forget them.'
}

export function History({ onOpen, focusSearch, keep, shown = true }: { onOpen: () => void; focusSearch: number; keep: KeepChats; shown?: boolean }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<ChatSummary[] | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const latest = useRef(0)

  // The list stays mounted beside the chat (Spec 09), so it reloads whenever its chats can have changed: on show,
  // and as a question goes out, an answer ends, a new chat starts or a saved one opens.
  useEffect(() => {
    if (!shown) return
    const reload = () => void window.otty.listChats().then(setChats)
    reload()
    return window.otty.onChatEvent((e) => {
      if (e.type === 'user' || e.type === 'done' || e.type === 'reset' || e.type === 'load') reload()
    })
  }, [shown])

  const loaded = chats !== null
  useEffect(() => {
    searchRef.current?.focus()
  }, [focusSearch, loaded])

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

  const forget = async (ids: string[]) => {
    for (const id of ids) {
      // shortcut: one IPC call per chat, fine for a screenful; add a bulk channel if people forget hundreds at once.
      await window.otty.deleteChat(id)
    }
    setChats((cs) => cs!.filter((x) => !ids.includes(x.id)))
    setPicked(new Set())
    setPending(null)
  }

  const togglePick = (id: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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
    <div
      className={`history${picked.size > 0 ? ' history--picking' : ''}`}
      onKeyDown={(e) => {
        // Esc clears a selection; the first Esc must not also close the window.
        if (e.key === 'Escape' && picked.size > 0 && !pending && !query) {
          e.stopPropagation()
          setPicked(new Set())
        }
      }}
    >
      <label className="history__search">
        <Icon name="search" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search your chats"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value.trim()) setPicked(new Set()) // selecting and searching don't mix
          }}
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
              <button className="history__open" onClick={() => void open(h.chatId, h.messageId)}>
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
          {picked.size > 0 && (
            <div className="history__bar" role="toolbar" aria-label="Selected chats">
              <span className="history__bar-count">{picked.size} selected</span>
              {picked.size < chats.length && (
                <button className="btn btn--soft btn--small" onClick={() => setPicked(new Set(chats.map((c) => c.id)))}>
                  Select all
                </button>
              )}
              <button
                className="btn btn--soft btn--small"
                onClick={() => setPending(chats.filter((c) => picked.has(c.id)))}
              >
                <Icon name="trash" />
                Forget
              </button>
              <button
                className="icon-btn icon-btn--sm"
                title="Clear selection"
                aria-label="Clear selection"
                onClick={() => setPicked(new Set())}
              >
                <Icon name="cross-small" />
              </button>
            </div>
          )}
          {chats.map((c) => (
            <div key={c.id} className="history__item">
              <input
                type="checkbox"
                className="check history__pick"
                aria-label={`Select “${c.title}”`}
                checked={picked.has(c.id)}
                onChange={() => togglePick(c.id)}
              />
              <button className="history__open" onClick={() => void open(c.id)}>
                <span className="history__title">{c.title}</span>
                <span className="history__meta">
                  {c.draft ? (
                    <>
                      <b className="history__draft">Draft:</b> {c.draft}
                    </>
                  ) : (
                    <>
                      {c.app && <>{c.app} · </>}
                      {ago(c.updatedAt)}
                    </>
                  )}
                </span>
              </button>
              <button
                className="icon-btn icon-btn--sm history__delete"
                title="Forget this chat"
                onClick={() => setPending([c])}
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

      {pending && (
        <ForgetDialog
          count={pending.length}
          title={pending.length === 1 ? pending[0].title : undefined}
          onConfirm={() => void forget(pending.map((c) => c.id))}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}

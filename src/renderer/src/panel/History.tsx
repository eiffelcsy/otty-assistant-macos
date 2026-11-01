import { useEffect, useState } from 'react'
import type { ChatSummary } from '../../../shared/types'
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

/** Saved chats, newest first. Opening one swaps it into the chat view. */
export function History({ onOpen }: { onOpen: () => void }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null)

  useEffect(() => {
    window.otty.listChats().then(setChats)
  }, [])

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

  return (
    <div className="history">
      {chats.map((c) => (
        <div key={c.id} className="history__item">
          <button
            className="history__open"
            onClick={async () => {
              await window.otty.openChat(c.id)
              onOpen()
            }}
          >
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
      <p className="hint history__note">Otty keeps your last 50 chats on this Mac. Screen snips are never saved.</p>
    </div>
  )
}

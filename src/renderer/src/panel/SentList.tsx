import { useEffect, useState } from 'react'
import type { SentItem, SentKind } from '../../../shared/types'
import { describeWhen } from '../../../shared/when'
import { Icon } from '../components/Icon'

// "What left your Mac" (D-31): every request, search and page read, newest first, in plain words. Main builds each
// row from names and counts, never the text that was sent, so this list can't leak what the chat holds.

const ICONS: Record<SentKind, string> = {
  question: 'comment',
  job: 'binoculars',
  title: 'edit',
  explain: 'book-open-reader',
  check: 'plug-connection',
  search: 'search',
  page: 'globe'
}

/** "Asked DeepSeek: Budget.xlsx · 3 keys hidden". */
export function sentLine(item: SentItem): string {
  const what = item.what ? `: ${item.what}` : ''
  if (item.local) {
    if (item.kind === 'question') return `Asked the model on this Mac${what}`
    return `Used the model on this Mac${what}`
  }
  const to = item.service
  switch (item.kind) {
    case 'question':
      return `Asked ${to}${what}`
    case 'job':
      return `Looked into something with ${to}${what}`
    case 'title':
      return `Asked ${to} for a chat title`
    case 'explain':
      return `Asked ${to} to explain “${item.what}”`
    case 'check':
      return `Checked the connection to ${to}`
    case 'search':
      return item.what ? `Searched ${to} for “${item.what}”` : `${to} searched the web`
    case 'page':
      return item.service === item.host ? `Read ${item.what || item.host}` : `Read ${item.what || 'a page'} through ${to}`
  }
}

/** What a row adds, under its line. */
function sub(item: SentItem): string {
  const parts = [describeWhen(item.at)]
  if (item.count > 1) parts.push(item.kind === 'job' ? `${item.count} requests` : `${item.count} rounds`)
  if (item.local) parts.push('nothing left your Mac')
  else if (item.host && item.host !== item.service) parts.push(item.host)
  return parts.join(' · ')
}

export function SentList({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
  const [items, setItems] = useState<SentItem[] | null>(null)
  useEffect(() => {
    void window.otty.listSent().then(setItems)
  }, [])

  if (!items) return null
  if (!items.length) {
    return (
      <div className="activity__empty">
        <Icon name="shield-check" />
        <p>Nothing has left your Mac yet. When Otty asks your AI service, searches or reads a page, it’s listed here: where it went, and why.</p>
      </div>
    )
  }
  return (
    <div className="sent">
      <p className="hint sent__intro">Everything Otty sent off your Mac, newest first. It’s kept as long as your chats, and goes when they do.</p>
      <ul className="activity__list">
        {items.map((item) => (
          <li key={item.id} className={`activity-row sent-row${item.local ? ' sent-row--local' : ''}`}>
            <Icon name={item.local ? 'laptop' : ICONS[item.kind]} />
            <div className="activity-row__body">
              <div className="sent-row__line">{sentLine(item)}</div>
              <div className="activity-row__state">{sub(item)}</div>
            </div>
            {item.chatId && (
              <div className="activity-row__actions">
                <button className="btn btn--soft btn--small" onClick={() => onOpenChat(item.chatId!)}>
                  Open
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

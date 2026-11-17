import { useEffect, useState } from 'react'
import type { ChangeItem } from '../../../shared/types'
import { describeWhen } from '../../../shared/when'
import { Icon } from '../components/Icon'

// "What Otty changed" (D-46): every change Otty made, from the ledger, newest first. Beside "What left your Mac", it
// answers "what did it do?" as plainly as that one answers "what did it send?".

function sub(item: ChangeItem): string {
  const parts = [describeWhen(item.at)]
  if (item.status === 'failed') parts.push('didn’t work')
  else if (item.status === 'denied') parts.push('you said no')
  else if (item.status === 'running') parts.push('didn’t finish')
  else if (item.undone) parts.push('undone')
  else if (!item.canUndo) parts.push('can’t be undone')
  return parts.join(' · ')
}

export function ChangeList({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
  const [items, setItems] = useState<ChangeItem[] | null>(null)
  useEffect(() => {
    void window.otty.listChanges().then(setItems)
  }, [])

  if (!items) return null
  if (!items.length) {
    return (
      <div className="activity__empty">
        <Icon name="time-past" />
        <p>Otty hasn’t changed anything yet. When it adds a reminder, remembers something or presses a button for you, it’s listed here, with whether it can be undone.</p>
      </div>
    )
  }
  return (
    <div className="sent">
      <p className="hint sent__intro">Everything Otty changed, newest first. It’s kept as long as your chats, and goes when they do.</p>
      <ul className="activity__list">
        {items.map((item) => (
          <li key={item.id} className={`activity-row sent-row${item.status === 'done' && !item.undone ? '' : ' sent-row--local'}`}>
            <Icon name={item.undone ? 'undo' : 'check-circle'} />
            <div className="activity-row__body">
              <div className="sent-row__line">{item.summary}</div>
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

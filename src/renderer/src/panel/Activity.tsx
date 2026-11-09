import { useEffect } from 'react'
import type { ActivityItem } from '../../../shared/types'
import { Icon } from '../components/Icon'

const STATES: Record<ActivityItem['state'], string> = {
  queued: 'Waiting its turn',
  working: 'Working',
  waiting: 'Waiting for you',
  done: 'Done',
  paused: 'Paused',
  failed: 'Couldn’t finish'
}

function detail(item: ActivityItem): string {
  if (item.kind === 'answer') return 'Still answering'
  const pages = item.pages ? ` · ${item.pages} ${item.pages === 1 ? 'page' : 'pages'} read` : ''
  const part = item.state === 'done' && item.partial ? ' · only part of the answer' : ''
  return `${STATES[item.state]}${pages}${part}`
}

function Row({ item, onOpen }: { item: ActivityItem; onOpen: () => void }) {
  const open = () => {
    void window.otty.openActivity(item)
    onOpen()
  }
  const live = item.state === 'queued' || item.state === 'working' || item.state === 'waiting' || item.state === 'paused'
  return (
    <li className="activity-row">
      <div className="activity-row__body">
        <div className="activity-row__title">{item.title}</div>
        <div className="activity-row__state">{detail(item)}</div>
        {item.note && <div className="activity-row__note">{item.note}</div>}
        {item.state === 'waiting' && item.waitUrl && (
          <>
            <div className="activity-row__note">Read this page?</div>
            <code className="activity-row__url">{item.waitUrl}</code>
          </>
        )}
      </div>
      <div className="activity-row__actions">
        {item.state === 'waiting' && (
          <>
            <button className="btn btn--primary btn--small" onClick={() => void window.otty.answerActivity(item.id, true)}>
              Allow
            </button>
            <button className="btn btn--soft btn--small" onClick={() => void window.otty.answerActivity(item.id, false)}>
              Don’t allow
            </button>
          </>
        )}
        {item.state === 'paused' && (
          <button className="btn btn--primary btn--small" onClick={() => void window.otty.resumeActivity(item.id)}>
            Keep going
          </button>
        )}
        {item.state === 'failed' && item.retry && (
          <button className="btn btn--primary btn--small" onClick={() => void window.otty.retryActivity(item.id)}>
            Try again
          </button>
        )}
        {item.chatId && (
          <button className="btn btn--soft btn--small" onClick={open}>
            Open
          </button>
        )}
        {live && (
          <button className="btn btn--soft btn--small" onClick={() => void window.otty.stopActivity(item)}>
            Stop
          </button>
        )}
      </div>
    </li>
  )
}

/** What Otty is doing while the user looks away. */
export function Activity({ items, onOpen }: { items: ActivityItem[]; onOpen: () => void }) {
  const unseen = items.some((i) => i.unseen)
  useEffect(() => {
    if (unseen) void window.otty.seenActivity()
  }, [unseen])

  if (!items.length) {
    return (
      <div className="activity activity--empty">
        <Icon name="binoculars" />
        <p>When Otty looks into something big for you, it shows up here. You can carry on chatting meanwhile.</p>
      </div>
    )
  }
  return (
    <ul className="activity">
      {[...items].reverse().map((i) => (
        <Row key={i.id} item={i} onOpen={onOpen} />
      ))}
    </ul>
  )
}

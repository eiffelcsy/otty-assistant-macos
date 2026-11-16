import { useEffect, useState } from 'react'
import type { ActivityItem } from '../../../shared/types'
import { describeWhen } from '../../../shared/when'
import { Icon } from '../components/Icon'
import { ChangeList } from './ChangeList'
import { SentList } from './SentList'

const STATES: Record<ActivityItem['state'], string> = {
  scheduled: 'Scheduled',
  queued: 'Waiting its turn',
  working: 'Working',
  waiting: 'Waiting for you',
  done: 'Done',
  paused: 'Paused',
  failed: 'Couldn’t finish'
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function detail(item: ActivityItem): string {
  if (item.kind === 'answer') return 'Still answering'
  if (item.state === 'scheduled' && item.dueAt) return item.repeat ? `${capital(item.repeat)} · next ${describeWhen(item.dueAt)}` : `Will look ${describeWhen(item.dueAt)}`
  const pages = item.pages ? ` · ${item.pages} ${item.pages === 1 ? 'page' : 'pages'} read` : ''
  const part = item.state === 'done' && item.partial ? ' · only part of the answer' : ''
  return `${STATES[item.state]}${pages}${part}`
}

function Row({ item, onOpen }: { item: ActivityItem; onOpen: () => void }) {
  const open = () => {
    void window.otty.openActivity(item)
    onOpen()
  }
  const live = item.state === 'scheduled' || item.state === 'queued' || item.state === 'working' || item.state === 'waiting' || item.state === 'paused'
  return (
    <li className="activity-row">
      <div className="activity-row__body">
        <div className="activity-row__title">
          {item.repeat && <Icon name="arrows-repeat" />} {item.title}
        </div>
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
        {item.held && (
          <button className="btn btn--primary btn--small" onClick={() => void window.otty.saveSettings({ workPaused: false })}>
            Let Otty carry on
          </button>
        )}
        {item.state === 'paused' && !item.held && (
          <button className="btn btn--primary btn--small" onClick={() => void window.otty.resumeActivity(item.id)}>
            {item.overCap ? 'Run it anyway' : 'Keep going'}
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
            {item.repeat ? 'Stop repeating' : item.state === 'scheduled' ? 'Cancel' : 'Stop'}
          </button>
        )}
      </div>
    </li>
  )
}

/** The one stop control, where the work it stops is listed. The otter's menu and the menu bar have it too. */
function PauseBar({ paused, onPause }: { paused: boolean; onPause: (on: boolean) => void }) {
  if (paused) {
    return (
      <div className="pause-bar pause-bar--on" role="status">
        <Icon name="pause" solid />
        <span>Otty is paused. Nothing runs on its own until you let it carry on.</span>
        <button className="btn btn--primary btn--small" onClick={() => onPause(false)}>
          Let Otty carry on
        </button>
      </div>
    )
  }
  return (
    <div className="pause-bar">
      <button className="btn btn--soft btn--small" onClick={() => onPause(true)} title="Stops what’s running and anything scheduled, until you say so">
        <Icon name="pause" /> Pause everything
      </button>
    </div>
  )
}

export type Tab = 'work' | 'sent' | 'changed'

/**
 * What Otty is doing while the user looks away: what's coming up first, soonest at the top, then the rest, newest
 * first. Beside it: what left the Mac (D-31) and what Otty changed (D-46), so "what did it send?" and "what did it
 * change?" have answers next to "what is it doing?".
 */
export function Activity({
  items,
  onOpen,
  onOpenChat,
  paused,
  onPause,
  startTab = 'work'
}: {
  items: ActivityItem[]
  onOpen: () => void
  onOpenChat: (chatId: string) => void
  paused: boolean
  onPause: (on: boolean) => void
  /** Which list shows first: Settings › Privacy opens "What left your Mac" directly. */
  startTab?: Tab
}) {
  const [tab, setTab] = useState<Tab>(startTab)
  return (
    <div className="activity">
      <div className="activity__tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'work'} aria-label="What Otty is doing" title="What Otty is doing" className="activity__tab" onClick={() => setTab('work')}>
          Doing
        </button>
        <button role="tab" aria-selected={tab === 'sent'} aria-label="What left your Mac" title="What left your Mac" className="activity__tab" onClick={() => setTab('sent')}>
          Left your Mac
        </button>
        <button role="tab" aria-selected={tab === 'changed'} aria-label="What Otty changed" title="What Otty changed" className="activity__tab" onClick={() => setTab('changed')}>
          Changed
        </button>
      </div>
      {tab === 'work' && <Work items={items} onOpen={onOpen} paused={paused} onPause={onPause} />}
      {tab === 'sent' && <SentList onOpenChat={onOpenChat} />}
      {tab === 'changed' && <ChangeList onOpenChat={onOpenChat} />}
    </div>
  )
}

function Work({ items, onOpen, paused, onPause }: { items: ActivityItem[]; onOpen: () => void; paused: boolean; onPause: (on: boolean) => void }) {
  const unseen = items.some((i) => i.unseen)
  useEffect(() => {
    if (unseen) void window.otty.seenActivity()
  }, [unseen])

  const upcoming = items.filter((i) => i.state === 'scheduled').sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
  const rest = items.filter((i) => i.state !== 'scheduled').reverse()

  return (
    <>
      {(items.length > 0 || paused) && <PauseBar paused={paused} onPause={onPause} />}
      {!items.length && (
        <div className="activity__empty">
          <Icon name="binoculars" />
          <p>When Otty looks into something big for you, or checks something later, it shows up here. You can carry on chatting meanwhile.</p>
          <p className="hint">Try “look into the best laptop under $1,000 across several sites”, or “check this page again tomorrow at 9”.</p>
        </div>
      )}
      {upcoming.length > 0 && (
        <>
          <h4 className="activity__heading">
            <Icon name="calendar-clock" /> Coming up
          </h4>
          <ul className="activity__list">
            {upcoming.map((i) => (
              <Row key={i.id} item={i} onOpen={onOpen} />
            ))}
          </ul>
        </>
      )}
      {rest.length > 0 && (
        <>
          {upcoming.length > 0 && <h4 className="activity__heading">Recent</h4>}
          <ul className="activity__list">
            {rest.map((i) => (
              <Row key={i.id} item={i} onOpen={onOpen} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

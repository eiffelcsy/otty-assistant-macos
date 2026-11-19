import { useCallback, useEffect, useRef, useState } from 'react'
import type { LogControl, LogDay, LogDetails, LogEntry, LogNow, LogPage, LogView } from '../../../../shared/types'
import { findRanges, parseQuery } from '../../../../shared/match'
import { Icon } from '../../components/Icon'

// The Logbook (D-63, Spec 04): what Otty has been doing, as views beside a ledger. Every word comes from main
// (`logbook/words.ts`); this file only lays it out and sends ids back. Width alone sets the layout (container queries
// in styles.css): one column under 640, the views beside the ledger from 640, and the opened entry in a pane from 1248.

const jobId = (id: string) => id.slice(id.indexOf(':') + 1)

/** Runs one press, by kind, with the entry it belongs to. */
async function press(kind: LogControl['kind'], id: string, onOpenChat: (chatId: string) => void, chatId?: string): Promise<void> {
  const job = jobId(id)
  switch (kind) {
    case 'allow':
    case 'deny':
      return window.otty.answerActivity(job, kind === 'allow')
    case 'resume':
      return window.otty.resumeActivity(job)
    case 'retry':
      return window.otty.retryActivity(job)
    case 'stop':
      return window.otty.stopActivity({ id: job })
    case 'carry-on':
      return void (await window.otty.saveSettings({ workPaused: false }))
    case 'undo':
      return void (await window.otty.undoChange(id))
    case 'open':
      if (id.startsWith('job:')) return window.otty.openActivity({ id: job }).then(() => onOpenChat(''))
      if (chatId) return onOpenChat(chatId)
      return
    case 'decide':
      return
  }
}

/** The first line, with the thing acted on in 700, or the words a search matched. */
function Bolded({ text, strong, terms }: { text: string; strong?: string; terms: string[] }) {
  const ranges = terms.length ? findRanges(text, terms) : strong && text.includes(strong) ? [[text.indexOf(strong), text.indexOf(strong) + strong.length] as [number, number]] : []
  if (!ranges.length) return <>{text}</>
  const out: React.ReactNode[] = []
  let at = 0
  for (const [a, b] of ranges) {
    if (a > at) out.push(text.slice(at, a))
    out.push(<b key={a}>{text.slice(a, b)}</b>)
    at = b
  }
  out.push(text.slice(at))
  return <>{out}</>
}

function Entry({ entry, selected, terms, onOpen, onAction }: { entry: LogEntry; selected: boolean; terms: string[]; onOpen: () => void; onAction: (c: LogControl) => void }) {
  return (
    <li className={`log-entry${selected ? ' log-entry--selected' : ''}${entry.undone ? ' log-entry--undone' : ''}${entry.tone ? ` log-entry--${entry.tone}` : ''}`}>
      <button className="log-entry__open" aria-label={entry.label} onClick={onOpen}>
        <span className="log-entry__time">{entry.time}</span>
        <Icon name={entry.glyph} className="log-entry__glyph" />
        <span className="log-entry__text">
          <span className="log-entry__first">
            <Bolded text={entry.first} strong={entry.strong} terms={terms} />
          </span>
          <span className="log-entry__second">{entry.second}</span>
        </span>
      </button>
      {entry.undone ? (
        <span className="log-entry__done">Undone</span>
      ) : entry.action ? (
        <button className="log-entry__action" onClick={() => onAction(entry.action!)}>
          {entry.action.label}
        </button>
      ) : null}
    </li>
  )
}

function Day({ day, terms, openId, onOpen, onAction }: { day: LogDay; terms: string[]; openId: string | null; onOpen: (id: string) => void; onAction: (e: LogEntry, c: LogControl) => void }) {
  const [shown, setShown] = useState(!day.folded)
  return (
    <section className="log-day" aria-label={`${day.title}, ${day.count}`}>
      <h3 className="log-day__head">
        {day.title} <span className="log-day__count">{day.count}</span>
      </h3>
      {shown ? (
        <ul className="log-day__list">
          {day.entries.map((e) => (
            <Entry key={e.id} entry={e} selected={e.id === openId} terms={terms} onOpen={() => onOpen(e.id)} onAction={(c) => onAction(e, c)} />
          ))}
        </ul>
      ) : (
        <button className="log-day__more" onClick={() => setShown(true)}>
          Show {day.count}
        </button>
      )}
    </section>
  )
}

/** A look-up under way: real progress, a steering note, and Stop (R3, R6, R7, R8). */
function NowCard({ now, stopping, onStop }: { now: LogNow; stopping: boolean; onStop: () => void }) {
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const segments = now.expected <= 12
  const send = async () => {
    if (await window.otty.noteJob(now.id, note)) {
      setNote('')
      setNoting(false)
    }
  }
  return (
    <div className={`log-now${now.paused ? ' log-now--paused' : ''}`}>
      <div className="log-now__title">
        <span className="log-now__dot" aria-hidden="true" />
        {now.title}
      </div>
      <div className="log-now__line">{now.line}</div>
      {now.note && <div className="log-now__note">Your note: {now.note}</div>}
      <div className="log-now__progress" role="progressbar" aria-label={now.line} aria-valuemin={0} aria-valuemax={now.expected} aria-valuenow={now.done}>
        {segments ? (
          Array.from({ length: now.expected }, (_, i) => <span key={i} className={`log-now__seg${i < now.done ? ' log-now__seg--done' : i === now.done ? ' log-now__seg--now' : ''}`} />)
        ) : (
          <span className="log-now__bar" style={{ width: `${Math.round((now.done / now.expected) * 100)}%` }} />
        )}
      </div>
      {noting && (
        <input
          className="field log-now__field"
          autoFocus
          maxLength={500}
          value={note}
          placeholder="Tell it something, like “only check JR East”"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && note.trim()) void send()
            if (e.key === 'Escape') {
              e.stopPropagation()
              setNoting(false)
            }
          }}
        />
      )}
      <div className="log-now__actions">
        {now.paused ? (
          <button className="btn btn--primary btn--small" onClick={() => void window.otty.saveSettings({ workPaused: false })}>
            Carry on
          </button>
        ) : (
          <>
            {!noting && (
              <button className="btn btn--soft btn--small" onClick={() => setNoting(true)}>
                Add a note
              </button>
            )}
            <button className="btn btn--quiet btn--small" disabled={stopping} onClick={onStop}>
              {stopping ? 'Stopping…' : 'Stop'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Details({ details, onBack, onPress, onOpenChat }: { details: LogDetails; onBack: () => void; onPress: (c: LogControl, chatId?: string) => void; onOpenChat: (chatId: string) => void }) {
  return (
    <div className="log-details">
      <button className="log-details__back btn btn--quiet btn--small" onClick={onBack}>
        <Icon name="angle-small-left" /> Logbook
      </button>
      <div>
        <h2 className="log-details__title">{details.title}</h2>
        <div className="log-details__time">{details.time}</div>
      </div>
      {details.waitUrl && (
        <Block label="Wants to read">
          <code className="log-details__url">{details.waitUrl}</code>
        </Block>
      )}
      <Block label="Why">{details.why}</Block>
      {details.sent.length > 0 && (
        <Block label="What it sent">
          <ul className="log-details__list">
            {details.sent.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Block>
      )}
      {details.changes.length > 0 && (
        <Block label="What it changed">
          {details.changes.map((c, i) => (
            <div key={i} className="log-details__change">
              <span>
                {c.line}
                <span className="log-details__note">{c.note}</span>
              </span>
              {c.action && (
                <button className="btn btn--soft btn--small" onClick={() => onPress(c.action!)}>
                  {c.action.label}
                </button>
              )}
            </div>
          ))}
        </Block>
      )}
      {details.partOf && (
        <Block label="Part of">
          <button className="log-details__link" onClick={() => onOpenChat(details.partOf!.chatId)}>
            <Icon name="comment" /> {details.partOf.label}
          </button>
        </Block>
      )}
      {details.controls.length > 0 && (
        <div className="log-details__controls">
          {details.controls.map((c) => (
            <button key={c.kind} className={`btn btn--small ${c.primary ? 'btn--primary' : 'btn--soft'}`} onClick={() => onPress(c, details.partOf?.chatId)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="log-block">
      <h3 className="log-block__label">{label}</h3>
      <div className="log-block__card">{children}</div>
    </section>
  )
}

export function Logbook({ startView = 'all', startEntry, onOpenChat }: { startView?: LogView; startEntry?: string; onOpenChat: (chatId: string) => void }) {
  const [view, setView] = useState<LogView>(startView)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<LogPage | null>(null)
  const [openId, setOpenId] = useState<string | null>(startEntry ?? null)
  const [details, setDetails] = useState<LogDetails | null>(null)
  const [menu, setMenu] = useState(false)
  const [stopping, setStopping] = useState<Set<string>>(new Set())
  const asked = useRef(0)

  const load = useCallback(() => {
    const n = ++asked.current
    void window.otty.logbook(view, search).then((p) => n === asked.current && setPage(p))
  }, [view, search])

  useEffect(() => {
    const t = setTimeout(load, search ? 150 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  useEffect(() => {
    void window.otty.seenActivity()
  }, [])

  // Opened on an entry (from Home): its details come with it.
  useEffect(() => {
    if (startEntry) void window.otty.logbookEntry(startEntry).then(setDetails)
  }, [startEntry])

  const refresh = useCallback(() => {
    load()
    if (openId)
      void window.otty.logbookEntry(openId).then((d) => {
        setDetails(d)
        // The entry is gone (a series stopped, a chat forgotten): back to the ledger.
        if (!d) setOpenId(null)
      })
  }, [load, openId])
  useEffect(() => window.otty.onLogbook(refresh), [refresh])

  const open = (id: string) => {
    setOpenId(id)
    void window.otty.logbookEntry(id).then(setDetails)
  }

  const run = async (c: LogControl, id: string, chatId?: string) => {
    if (c.kind === 'decide') return open(id)
    if (c.kind === 'stop') setStopping((s) => new Set(s).add(id))
    await press(c.kind, id, onOpenChat, chatId)
    refresh()
  }

  const terms = search.trim() ? parseQuery(search) : []
  const pick = (v: LogView) => {
    setView(v)
    setMenu(false)
    setOpenId(null)
    setDetails(null)
  }
  const looking = page?.views.slice(3) ?? []

  return (
    <div className={`logbook${openId && details ? ' logbook--open' : ''}`}>
      <nav className="logbook__views" aria-label="Logbook views">
        <div role="listbox" aria-label="Views">
          {page?.views.slice(0, 3).map((v) => (
            <button key={v.view} role="option" aria-selected={v.view === view} className="log-view" onClick={() => pick(v.view)}>
              <span>{v.name}</span>
              {v.count > 0 && <span className={`log-view__count${v.view === 'wait' ? ' log-view__count--wait' : ''}`}>{v.count}</span>}
            </button>
          ))}
          <div className="log-views__label">Looking for…</div>
          {looking.map((v) => (
            <button key={v.view} role="option" aria-selected={v.view === view} className="log-view log-view--two" onClick={() => pick(v.view)}>
              <span>{v.name}</span>
              <span className="log-view__description">{v.description}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="logbook__main">
        <div className="log-head">
          <div className="log-head__row">
            <button className="log-head__menu" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              {page?.title ?? ''}
              <Icon name="angle-small-down" />
            </button>
            <h2 className="log-head__title">{page?.title ?? ''}</h2>
            {page?.subtitle && <span className="log-head__subtitle">{page.subtitle}</span>}
          </div>
          {menu && page && (
            <div className="menu log-head__views" role="menu">
              {page.views.map((v) => (
                <button key={v.view} role="menuitemradio" aria-checked={v.view === view} className="menu__item log-head__item" onClick={() => pick(v.view)}>
                  <span>{v.name}</span>
                  {v.count > 0 && <span className="log-view__count">{v.count}</span>}
                </button>
              ))}
            </div>
          )}
          <input className="field log-head__search" type="search" maxLength={200} placeholder="Search the Logbook" aria-label="Search the Logbook" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {page?.paused && (
          <div className="log-paused" role="status">
            <Icon name="pause" />
            <span>{page.paused}</span>
            <button className="btn btn--primary btn--small" onClick={() => void window.otty.saveSettings({ workPaused: false }).then(refresh)}>
              Carry on
            </button>
          </div>
        )}

        {page && page.now.length > 0 && (
          <div className="log-nows">
            {page.now.slice(0, 2).map((n) => (
              // Stopping… lasts while the look-up is still in Now, until the runner confirms (R8).
              <NowCard key={n.id} now={n} stopping={stopping.has(`job:${n.id}`)} onStop={() => void run({ kind: 'stop', label: 'Stop' }, `job:${n.id}`)} />
            ))}
            {page.now.length > 2 && <div className="log-nows__more">and {page.now.length - 2} more</div>}
          </div>
        )}

        <div className="log-ledger">
          {page && !page.days.length && <p className="log-empty">{page.empty}</p>}
          {page?.days.map((d) => (
            <Day key={`${view}:${search}:${d.date}`} day={d} terms={terms} openId={openId} onOpen={open} onAction={(e, c) => void run(c, e.id)} />
          ))}
        </div>
      </div>

      <aside className="logbook__details" aria-label="Entry">
        {details ? (
          <Details
            details={details}
            onBack={() => {
              setOpenId(null)
              setDetails(null)
            }}
            onPress={(c, chatId) => void run(c, details.id, chatId)}
            onOpenChat={onOpenChat}
          />
        ) : (
          <p className="log-empty">Choose an entry to see why it happened and what it touched.</p>
        )}
      </aside>
    </div>
  )
}

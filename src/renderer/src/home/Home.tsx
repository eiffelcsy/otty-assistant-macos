import { useCallback, useEffect, useState } from 'react'
import type { HomeNeed, HomePage, LogControl, Words } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { Cove, FloatingOtty } from '../components/Cove'

// Home (D-66, Spec 06): the otter, how things stand in one sentence, then only the blocks with something in them.
// Every word comes from main (`main/home/`); deciding an item sends its Logbook id through the same channels as the
// Logbook and the chat's cards. Laid out by its own width (container queries), never the window's.

const jobId = (id: string) => id.slice(id.indexOf(':') + 1)

/** Main's words, with their bold parts. */
function Said({ words }: { words: Words }) {
  return (
    <>
      {words.map((w, i) => (w.strong ? <b key={i}>{w.text}</b> : <span key={i}>{w.text}</span>))}
    </>
  )
}

async function decide(item: HomeNeed, c: LogControl, onOpenChat: (id: string) => void, onOpenEntry: (id: string) => void): Promise<void> {
  const id = jobId(item.id)
  if (c.kind === 'allow' || c.kind === 'deny') return window.otty.answerActivity(id, c.kind === 'allow')
  if (c.kind === 'resume') return window.otty.resumeActivity(id)
  if (c.kind === 'retry') return window.otty.retryActivity(id)
  if (c.kind === 'carry-on') return void (await window.otty.saveSettings({ workPaused: false }))
  if (c.kind === 'open' && item.chatId && item.id.startsWith('card:')) return onOpenChat(item.chatId)
  if (c.kind === 'open') return window.otty.openActivity({ id }).then(() => onOpenChat(''))
  onOpenEntry(item.id)
}

function Block({ label, glyph, value, wait, children }: { label: string; glyph: string; value?: string; wait?: boolean; children: React.ReactNode }) {
  return (
    <section className={`home-block${wait ? ' home-block--wait' : ''}`} aria-label={label}>
      <h2 className="home-block__head">
        <Icon name={glyph} />
        <span className="home-block__label">{label}</span>
        {value && <span className="home-block__value">{value}</span>}
      </h2>
      {children}
    </section>
  )
}

function Needs({ page, onOpenChat, onOpenEntry, onOpenLogbook }: { page: HomePage; onOpenChat: (id: string) => void; onOpenEntry: (id: string) => void; onOpenLogbook: () => void }) {
  const [open, setOpen] = useState(0)
  return (
    <Block label="Needs you" glyph="inbox-in" value={String(page.needs.total)} wait>
      <ul className="home-needs">
        {page.needs.items.map((item, i) =>
          i === open ? (
            <li key={item.id} className="home-need home-need--open">
              <Icon name={item.glyph} className="home-need__glyph" />
              <div className="home-need__body">
                <div className="home-need__question">{item.question}</div>
                <div className="home-need__subject">{item.subject}</div>
                <div className="home-need__actions">
                  {item.actions.map((c) => (
                    <button key={c.kind} className={`btn btn--small ${c.primary ? 'btn--primary' : 'btn--quiet'}`} onClick={() => void decide(item, c, onOpenChat, onOpenEntry)}>
                      {c.label}
                    </button>
                  ))}
                  <span className="home-need__since">{item.since}</span>
                </div>
              </div>
            </li>
          ) : (
            <li key={item.id} className="home-need">
              <button className="home-need__fold" onClick={() => setOpen(i)}>
                <Icon name={item.glyph} className="home-need__glyph" />
                <span className="home-need__question">{item.question}</span>
                <span className="home-need__since">{item.since}</span>
              </button>
            </li>
          )
        )}
      </ul>
      {page.needs.total > page.needs.items.length && (
        <button className="home-more" onClick={onOpenLogbook}>
          {page.needs.total - page.needs.items.length} more in the Logbook
        </button>
      )}
    </Block>
  )
}

function Today({ page, onOpenEntry }: { page: HomePage; onOpenEntry: (id: string) => void }) {
  const [unfolded, setUnfolded] = useState(false)
  return (
    <Block label="Today" glyph="clock" value={page.today.date}>
      <ol className="home-river">
        {page.today.folded > 0 && !unfolded && (
          <li className="home-tick home-tick--folded">
            <span className="home-tick__time" />
            <span className="home-tick__dot" />
            <button className="home-tick__text home-more" onClick={() => setUnfolded(true)}>
              {page.today.folded} earlier
            </button>
          </li>
        )}
        {page.today.ticks.map((t) => (
          <li key={t.id} className={`home-tick home-tick--${t.state}`}>
            <span className="home-tick__time">{t.time}</span>
            <span className="home-tick__dot" aria-hidden="true" />
            <button className="home-tick__text" aria-label={`${t.time}, ${t.state === 'done' ? 'done' : t.state === 'failed' ? 'couldn’t finish' : t.state === 'now' ? 'now' : 'later'}, ${t.title}`} onClick={() => onOpenEntry(t.id)}>
              <span className="home-tick__line">
                <Said words={t.text} />
              </span>
              {t.sub && <span className="home-tick__sub">{t.sub}</span>}
            </button>
          </li>
        ))}
      </ol>
    </Block>
  )
}

function After({ page, onOpenEntry, onOpenComingUp }: { page: HomePage; onOpenEntry: (id: string) => void; onOpenComingUp: () => void }) {
  return (
    <Block label="Looking after" glyph="arrows-repeat" value={String(page.after.total)}>
      <ul className="home-after">
        {page.after.items.map((a) => (
          <li key={a.id}>
            <button className="home-after__row" onClick={() => onOpenEntry(a.id)}>
              <Icon name={a.repeat ? 'arrows-repeat' : 'calendar'} />
              <span className="home-after__title">{a.title}</span>
              <span className="home-after__when">{a.when}</span>
            </button>
          </li>
        ))}
      </ul>
      {page.after.total > page.after.items.length && (
        <button className="home-more" onClick={onOpenComingUp}>
          All in the Logbook
        </button>
      )}
    </Block>
  )
}

export interface HomeProps {
  onOpenChat: (chatId: string) => void
  /** Opens an entry in the Logbook, by its id. */
  onOpenEntry: (id: string) => void
  onOpenLogbook: (view: 'wait' | 'next' | 'sent') => void
  /** Try asking: fills the message box, never sends. */
  onSuggest: (text: string) => void
  suggestions: string[]
}

export function Home({ onOpenChat, onOpenEntry, onOpenLogbook, onSuggest, suggestions }: HomeProps) {
  const [page, setPage] = useState<HomePage | null>(null)
  const load = useCallback(() => void window.otty.home().then(setPage), [])
  useEffect(() => {
    load()
    return window.otty.onLogbook(load)
  }, [load])
  const [squish, setSquish] = useState(0)

  if (!page) return <div className="home" />
  return (
    <div className="home" role="main" aria-label="Home">
      <Cove className="home__cove">
        <button key={squish} className="home-greeting__otter" aria-label="Otty" onClick={() => setSquish((n) => n + 1)}>
          <FloatingOtty />
        </button>
      </Cove>
      <div className="home__column">
        <div className="home-greeting">
          <h1 className="home-greeting__hello">{page.greeting}</h1>
          <p className="home-greeting__status" aria-live="polite">
            {page.status}
          </p>
          {page.now.map((n) => (
            <button key={n.id} className="home-now" onClick={() => onOpenEntry(n.id)}>
              <span className={`home-now__dot${n.paused ? ' home-now__dot--paused' : ''}`} aria-hidden="true" />
              <span>
                <Said words={n.text} />
              </span>
            </button>
          ))}
        </div>
        <div className="home__blocks">
          {page.needs.total > 0 && <Needs page={page} onOpenChat={onOpenChat} onOpenEntry={onOpenEntry} onOpenLogbook={() => onOpenLogbook('wait')} />}
          <div className="home__pair">
            {page.today.ticks.length + page.today.folded > 0 && <Today page={page} onOpenEntry={onOpenEntry} />}
            <div className="home__side">
              {page.after.total > 0 && <After page={page} onOpenEntry={onOpenEntry} onOpenComingUp={() => onOpenLogbook('next')} />}
              <section className="home-left" aria-label="What left your Mac">
                <Icon name="arrow-up-right-from-square" />
                <span>
                  <Said words={page.left} />{' '}
                  <button className="home-left__link" onClick={() => onOpenLogbook('sent')}>
                    Logbook
                  </button>
                </span>
              </section>
            </div>
          </div>
          {page.firstRun && suggestions.length > 0 && (
            <Block label="Try asking" glyph="comment">
              <ul className="home-try">
                {suggestions.slice(0, 3).map((t) => (
                  <li key={t}>
                    <button className="home-try__row" onClick={() => onSuggest(t)}>
                      <Icon name="arrow-turn-down-right" />
                      {t}
                    </button>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </div>
      </div>
    </div>
  )
}

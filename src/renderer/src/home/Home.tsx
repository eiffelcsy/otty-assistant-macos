import { useCallback, useContext, useEffect, useState } from 'react'
import type { CalendarItem, HomeNeed, HomePage, LogControl, Words } from '../../../shared/types'
import { flipWidget, HOME_WIDGETS, WIDGET_NAMES, type HomeWidget } from '../../../shared/homeWidgets'
import type { MyTile } from '../../../shared/tiles'
import { MenuButton } from '../components/MenuButton'
import { addDays, clock, dayStart, shortDay } from '../calendar/time'
import { AnimatePresence, m } from 'motion/react'
import { Icon } from '../components/Icon'
import { T, surface } from '../lib/motion'
import { CoveOtty } from '../components/Cove'
import { StillMove } from '../frame/Frame'

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

/** Home arrives in reading order, 60 ms apart: the greeting, then each block; not when it takes over from the empty chat (Spec 09). */
const arrive = (order: number, calm: boolean) =>
  calm ? { ...surface, initial: false as const } : { ...surface, animate: { ...surface.animate, transition: { delay: 0.1 + order * 0.06 } } }

/**
 * A block surfaces when it has something in it and ebbs away when it's empty; the blocks around it glide to their new
 * place (`layout="position"`, so glass and text are moved, never stretched).
 */
function Block({ label, glyph, value, wait, order, shared, action, children }: { label: string; glyph: string; value?: string; wait?: boolean; order: number; shared?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <m.section layout="position" {...arrive(order, false)} data-shared={shared} className={`home-block${wait ? ' home-block--wait' : ''}`} aria-label={label}>
      <h2 className="home-block__head">
        <Icon name={glyph} />
        <span className="home-block__label">{label}</span>
        {value && <span className="home-block__value">{value}</span>}
        {action}
      </h2>
      {children}
    </m.section>
  )
}

function Needs({ page, fresh, onOpenChat, onOpenEntry, onOpenLogbook }: { page: HomePage; fresh: boolean; onOpenChat: (id: string) => void; onOpenEntry: (id: string) => void; onOpenLogbook: () => void }) {
  const [open, setOpen] = useState(0)
  return (
    <Block label="Needs you" glyph="inbox-in" value={String(page.needs.total)} wait order={1}>
      <ul className="home-needs">
        {/* A decided item ebbs out of the flow at once and the rest glide up under it; the next one opens in place. */}
        <AnimatePresence mode="popLayout" initial={false}>
          {page.needs.items.map((item, i) =>
            i === open ? (
              <m.li key={item.id} layout="position" exit={surface.exit} className="home-need home-need--open">
                <Icon name={item.glyph} className="home-need__glyph" />
                <m.div className="home-need__body" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.quick }}>
                  <div className="home-need__question">{item.question}</div>
                  <div className="home-need__subject">{item.subject}</div>
                  <div className="home-need__actions">
                    {item.actions.map((c) => (
                      <button key={c.kind} className={`btn btn--small ${c.primary ? 'btn--primary' : 'btn--quiet'}`} disabled={!fresh} onClick={() => void decide(item, c, onOpenChat, onOpenEntry)}>
                        {c.label}
                      </button>
                    ))}
                    <span className="home-need__since">{item.since}</span>
                  </div>
                </m.div>
              </m.li>
            ) : (
              <m.li key={item.id} layout="position" exit={surface.exit} className="home-need">
                <button className="home-need__fold" onClick={() => setOpen(i)}>
                  <Icon name={item.glyph} className="home-need__glyph" />
                  <span className="home-need__question">{item.question}</span>
                  <span className="home-need__since">{item.since}</span>
                </button>
              </m.li>
            )
          )}
        </AnimatePresence>
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
    <Block label="Today" glyph="clock" value={page.today.date} order={2}>
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
    <Block label="Looking after" glyph="arrows-repeat" value={String(page.after.total)} order={3}>
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

/** Today's calendar (D-86): what's left of the day, or tomorrow's first event on a clear day. */
function CalendarWidget({ onOpen }: { onOpen: () => void }) {
  const [got, setGot] = useState<{ items: CalendarItem[]; now: number } | null>(null)
  // shortcut: refreshed when Home opens or the Logbook changes, not on a timer; a past event stays until then.
  const load = useCallback(() => {
    const today = dayStart(Date.now())
    void window.otty.calendarRange(today, addDays(today, 2)).then(
      (r) => setGot({ items: r.items, now: Date.now() }),
      () => setGot({ items: [], now: Date.now() })
    )
  }, [])
  useEffect(() => {
    load()
    return window.otty.onLogbook(load)
  }, [load])
  const items = got?.items ?? null
  const now = got?.now ?? 0
  const tomorrow = addDays(dayStart(now), 1)
  const left = (items ?? []).filter((e) => e.start < tomorrow && e.end > now).sort((a, b) => a.start - b.start)
  const next = left.length ? null : (items ?? []).filter((e) => e.start >= tomorrow).sort((a, b) => a.start - b.start)[0]
  const open = (
    <button className="icon-btn icon-btn--sm home-block__open" title="Open Calendar" data-keys="⌘5" onClick={onOpen}>
      <Icon name="arrow-small-right" />
    </button>
  )
  return (
    <Block label="Calendar" glyph="calendar" value={got ? shortDay(now) : undefined} order={2} action={open}>
      {items && (
        <ul className="home-after home-cal">
          {left.slice(0, 5).map((e) => (
            <li key={e.id}>
              <button className={`home-after__row${e.start <= now ? ' home-cal--now' : ''}`} onClick={onOpen}>
                <span className="home-cal__time">{e.allDay ? 'All day' : clock(e.start)}</span>
                <span className="home-after__title">{e.title}</span>
              </button>
            </li>
          ))}
          {!left.length && (
            <li className="home-cal__clear">
              {next ? (
                <>
                  Nothing else today. Tomorrow: <b>{next.allDay ? next.title : `${clock(next.start)} ${next.title}`}</b>
                </>
              ) : (
                'A clear day.'
              )}
            </li>
          )}
        </ul>
      )}
    </Block>
  )
}

/** The user's own tiles that need no capture (D-86): one tap starts a new chat with the tile's question. */
function TilesWidget({ tiles, onAsk, onMake }: { tiles: MyTile[]; onAsk: (text: string) => void; onMake: () => void }) {
  const mine = tiles.filter((t) => t.when === 'any')
  const add = (
    <button className="icon-btn icon-btn--sm home-block__open" title="Make a tile" onClick={onMake}>
      <Icon name="plus" />
    </button>
  )
  return (
    <Block label="My tiles" glyph="apps" order={4} action={add}>
      <ul className="home-after">
        {mine.map((t) => (
          <li key={t.id}>
            <button className="home-after__row" title={t.prompt} onClick={() => onAsk(t.prompt)}>
              <Icon name={t.icon} />
              <span className="home-after__title">{t.name}</span>
            </button>
          </li>
        ))}
        {!mine.length && <li className="home-cal__clear">Save a question you ask often, and it lands here.</li>}
      </ul>
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
  /** D-86: the widgets on, in Home's order, and the user's tiles. */
  widgets: HomeWidget[]
  tiles: MyTile[]
  onWidgets: (widgets: HomeWidget[]) => void
  /** Starts a new chat with these words, as typed (a tile). */
  onAsk: (text: string) => void
  onOpenCalendar: () => void
  onMakeTile: () => void
}

/** The last page shown, so Home opens on it instead of an empty frame while the next one loads (Spec 09). */
let lastPage: HomePage | null = null

export function Home({ onOpenChat, onOpenEntry, onOpenLogbook, onSuggest, suggestions, widgets, tiles, onWidgets, onAsk, onOpenCalendar, onMakeTile }: HomeProps) {
  const on = (w: HomeWidget) => widgets.includes(w)
  const [page, setPage] = useState<HomePage | null>(lastPage)
  // Spec 09: taking over from the empty chat, what mounts with Home skips its arrival; anything that appears later arrives.
  const still = useContext(StillMove)
  const [calm] = useState(still)
  // The cached page is shown at once, but nothing on it can be decided until the fresh one is in.
  const [fresh, setFresh] = useState(false)
  const load = useCallback(
    () =>
      void window.otty.home().then((p) => {
        lastPage = p
        setPage(p)
        setFresh(true)
      }),
    []
  )
  useEffect(() => {
    load()
    return window.otty.onLogbook(load)
  }, [load])
  if (!page) return <div className="home cove-scroll" />
  return (
    <div className="home cove-scroll" role="main" aria-label="Home">
      {/* The greeting on the sky and Otty in the water, over the frame's cove (D-74, Spec 07). */}
      <div className="cove-hero">
        <div className="cove-hero__words" data-shared="words">
          <m.div className="cove-hero__arrive" data-fresh {...arrive(0, calm)}>
            <span className="cove-hero__date">{page.date}</span>
            <h1 className="cove-hero__hello">{page.greeting}</h1>
            <p className="cove-hero__sentence" aria-live="polite">
              {page.status}
            </p>
          </m.div>
        </div>
        <CoveOtty />
      </div>
      <div className="home__column">
        {page.now.length > 0 && (
          <m.div className="home__now" {...arrive(1, calm)}>
            {page.now.map((n) => (
              <button key={n.id} className="home-now" onClick={() => onOpenEntry(n.id)}>
                <span className={`home-now__dot${n.paused ? ' home-now__dot--paused' : ''}`} aria-hidden="true" />
                <span>
                  <Said words={n.text} />
                </span>
              </button>
            ))}
          </m.div>
        )}
        <div className="home__blocks">
          <AnimatePresence initial={!calm}>
            {page.needs.total > 0 && <Needs key="needs" page={page} fresh={fresh} onOpenChat={onOpenChat} onOpenEntry={onOpenEntry} onOpenLogbook={() => onOpenLogbook('wait')} />}
          </AnimatePresence>
          <div className="home__pair">
            <div className="home__side">
              <AnimatePresence initial={!calm}>
                {on('calendar') && <CalendarWidget key="calendar" onOpen={onOpenCalendar} />}
                {on('today') && page.today.ticks.length + page.today.folded > 0 && <Today key="today" page={page} onOpenEntry={onOpenEntry} />}
              </AnimatePresence>
            </div>
            <div className="home__side">
              <AnimatePresence initial={!calm}>
                {on('after') && page.after.total > 0 && <After key="after" page={page} onOpenEntry={onOpenEntry} onOpenComingUp={() => onOpenLogbook('next')} />}
                {on('tiles') && <TilesWidget key="tiles" tiles={tiles} onAsk={onAsk} onMake={onMakeTile} />}
              </AnimatePresence>
              <m.section layout="position" {...arrive(4, calm)} className="home-left" aria-label="What left your Mac">
                <Icon name="arrow-up-right-from-square" />
                <span>
                  <Said words={page.left} />{' '}
                  <button className="home-left__link" onClick={() => onOpenLogbook('sent')}>
                    Logbook
                  </button>
                </span>
              </m.section>
            </div>
          </div>
          <AnimatePresence initial={!calm}>
            {page.firstRun && suggestions.length > 0 && (
              <Block key="try" label="Try asking" glyph="comment" order={5} shared="try">
                <ul className="home-try" data-fresh>
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
          </AnimatePresence>
          <MenuButton glyph="settings-sliders" label="Customise Home" className="home-custom">
            {() =>
              HOME_WIDGETS.map((w) => (
                <button key={w} className="menu__item home-custom__item" role="menuitemcheckbox" aria-checked={on(w)} onClick={() => onWidgets(flipWidget(widgets, w))}>
                  <Icon name={on(w) ? 'check' : 'minus-small'} />
                  {WIDGET_NAMES[w]}
                </button>
              ))
            }
          </MenuButton>
        </div>
      </div>
    </div>
  )
}

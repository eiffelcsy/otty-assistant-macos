import { useCallback, useEffect, useRef, useState } from 'react'
import type { CalendarItem, CalendarRange, EventFields } from '../../../shared/types'
import type { Band } from '../frame/bands'
import { Icon } from '../components/Icon'
import { m } from 'motion/react'
import { glide, T } from '../lib/motion'
import { Days } from './Days'
import { EventCard, type Draft } from './EventCard'
import { Month } from './Month'
import { Week } from './Week'
import { addDays, dayStart, mondayOf, monthOf, monthTitle, rangeTitle } from './time'

// The Calendar screen (D-73, Spec 11): Otty's own week with the connected calendars beside it. The band comes from the
// frame; a compact band shows the list, anything wider the week, and either can switch to the month. Every save and
// removal goes through main.

const SAVE_FAILED = 'That didn’t save. Try again.'
const MOVE_FAILED = 'Couldn’t move that. Try again.'
const LOAD_FAILED = 'Couldn’t read your calendar. Try again.'
const QUIET = 'Nothing this week. Add something, or ask Otty to plan it.'
const QUIET_MONTH = 'Nothing this month. Add something, or ask Otty to plan it.'
const OK_MS = 6000
const HOUR_MS = 3_600_000

type Editing = { kind: 'new'; draft: Draft } | { kind: 'item'; item: CalendarItem }
type Pending = { id: string; start: number; end: number }
type Mode = 'week' | 'month'

/** The first day for a band: today on the list, this week's Monday on the grid. */
const anchor = (compact: boolean): number => (compact ? dayStart(Date.now()) : mondayOf(Date.now()))

export function Calendar({ band }: { band: Band }) {
  const compact = band === 'compact'
  const [start, setStart] = useState(() => anchor(compact))
  const [shape, setShape] = useState(compact)
  // A band change moves between the list and the week, which start on different days: go back to the band's own first day.
  if (shape !== compact) {
    setShape(compact)
    setStart(anchor(compact))
  }
  const [mode, setMode] = useState<Mode>('week')
  const [month, setMonth] = useState(() => monthOf(Date.now()))
  const monthly = mode === 'month'
  const today = dayStart(Date.now())
  // The month shows six weeks from the Monday on or before its 1st; "today in view" means in the month itself.
  const from = monthly ? mondayOf(month) : start
  const end = addDays(from, monthly ? 42 : 7)
  const todayInView = monthly ? monthOf(today) === month : today >= start && today < end

  const [range, setRange] = useState<CalendarRange | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [ok, setOk] = useState<CalendarItem | null>(null)
  const [moveNote, setMoveNote] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const seq = useRef(0)

  const load = useCallback(() => {
    const mine = ++seq.current
    window.otty.calendarRange(from, end).then(
      (r) => {
        if (mine !== seq.current) return
        setRange(r)
        setPending(null)
      },
      () => {
        if (mine !== seq.current) return
        setRange({ items: [], note: LOAD_FAILED })
        setPending(null)
      }
    )
  }, [from, end])

  useEffect(() => {
    load()
  }, [load])

  // The Deleted line fades away after OK_MS.
  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => setOk(null), OK_MS)
    return () => clearTimeout(t)
  }, [ok])

  const shift = (dir: 1 | -1) => (monthly ? setMonth((x) => monthOf(x, dir)) : setStart((s) => addDays(s, dir * 7)))
  const goToday = () => (monthly ? setMonth(monthOf(Date.now())) : setStart(anchor(compact)))
  // A day in the month opens its week (or the list from that day on a compact band).
  const openDay = (day: number) => {
    setMode('week')
    setStart(compact ? day : mondayOf(day))
  }
  const addDefault = (): Draft => {
    if (todayInView) {
      const now = new Date()
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1).getTime()
      return { start: s, end: s + HOUR_MS, allDay: false }
    }
    const d = new Date(monthly ? month : start)
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9).getTime()
    return { start: s, end: s + HOUR_MS, allDay: false }
  }
  const add = () => setEditing({ kind: 'new', draft: addDefault() })

  // ⌘← and ⌘→ move a week (or a month), ⌘N adds; typing keeps its own arrows. ⌘N is taken here, before the panel's new chat.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key === 'n') {
        e.preventDefault()
        e.stopPropagation()
        if (!editing) setEditing({ kind: 'new', draft: addDefault() })
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isTyping(e.target)) {
        e.preventDefault()
        shift(e.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addDefault reads only the range and the clock
  }, [editing, todayInView, start, month, monthly])

  const save = async (fields: EventFields): Promise<boolean> => {
    const saved = await window.otty.saveEvent(fields).catch(() => null)
    if (!saved) return false
    setEditing(null)
    load()
    return true
  }

  const remove = async (item: CalendarItem): Promise<boolean> => {
    const gone = await window.otty.removeEvent(item.id).catch(() => false)
    if (!gone) return false
    setEditing(null)
    setOk(item)
    load()
    return true
  }

  const undo = async () => {
    const item = ok
    if (!item) return
    setOk(null)
    const back = await window.otty.saveEvent({ title: item.title, start: item.start, end: item.end, allDay: item.allDay, notes: item.notes }).catch(() => null)
    if (back) load()
    else setMoveNote(SAVE_FAILED)
  }

  const move = async (item: CalendarItem, s: number, e: number) => {
    setMoveNote(null)
    setPending({ id: item.id, start: s, end: e })
    const saved = await window.otty.saveEvent({ id: item.id, title: item.title, start: s, end: e, allDay: false, notes: item.notes }).catch(() => null)
    if (saved) load()
    else {
      setPending(null)
      setMoveNote(MOVE_FAILED)
    }
  }

  const items = range?.items ?? []
  const note = moveNote ?? range?.note
  const title = monthly ? monthTitle(month) : compact && start === today ? 'Next 7 days' : rangeTitle(start)
  const span = monthly ? 'month' : 'week'
  const openItem = (item: CalendarItem) => setEditing({ kind: 'item', item })

  return (
    <div className={`frame__screen cal${compact ? ' cal--list' : ''}`}>
      <div className="cal-bar">
        <h2 className="cal-bar__title">{title}</h2>
        <div className="lang-pill cal-mode" role="group" aria-label="Show">
          {(['week', 'month'] as const).map((x) => (
            <button key={x} type="button" className="lang-pill__opt" aria-pressed={mode === x} onClick={() => setMode(x)}>
              {mode === x && <m.span layoutId="cal-mode" className="lang-pill__mark" transition={{ duration: T.quick, ease: glide }} />}
              {x === 'week' ? (compact ? 'List' : 'Week') : 'Month'}
            </button>
          ))}
        </div>
        <button className="icon-btn" aria-label="Earlier" title={`Previous ${span} ⌘←`} onClick={() => shift(-1)}>
          <Icon name="angle-small-left" />
        </button>
        <button className="btn btn--soft btn--small" disabled={todayInView} aria-label="Today" onClick={goToday}>
          Today
        </button>
        <button className="icon-btn" aria-label="Later" title={`Next ${span} ⌘→`} onClick={() => shift(1)}>
          <Icon name="angle-small-right" />
        </button>
        <button className="btn btn--primary btn--small" aria-label="Add an event" title="Add an event ⌘N" onClick={add}>
          <Icon name="plus" />
          Add
        </button>
      </div>
      {ok && (
        <div className="ok-card cal-ok">
          <span className="cal-ok__text">Deleted “{ok.title}”</span>
          <button className="btn btn--quiet btn--small" aria-label="Undo" onClick={() => void undo()}>
            Undo
          </button>
        </div>
      )}
      {note && <div className="cal-note">{note}</div>}
      {range && !note && items.length === 0 && <div className="cal-note cal-note--quiet">{monthly ? QUIET_MONTH : QUIET}</div>}
      <div className="cal-body">
        {monthly ? (
          <Month start={from} month={month} items={items} today={today} compact={compact} onOpen={openItem} onDay={openDay} />
        ) : compact ? (
          <Days start={start} items={items} today={today} onOpen={openItem} />
        ) : (
          <Week
            start={start}
            items={items}
            pending={pending}
            today={today}
            loaded={range !== null}
            onOpen={openItem}
            onNew={(draft) => setEditing({ kind: 'new', draft: { ...draft, allDay: false } })}
            onMove={(item, s, e) => void move(item, s, e)}
          />
        )}
        {editing?.kind === 'new' && <EventCard draft={editing.draft} onSave={save} onDelete={remove} onClose={() => setEditing(null)} />}
        {editing?.kind === 'item' && (
          <EventCard
            key={editing.item.id}
            item={editing.item}
            onSave={save}
            onDelete={remove}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  )
}

const isTyping = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)

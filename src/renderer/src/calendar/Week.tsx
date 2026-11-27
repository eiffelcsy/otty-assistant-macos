import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as PointerEv } from 'react'
import type { CalendarItem } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { addDays, atMinute, clock, eventLabel, minutesOf } from './time'

// The week grid (Spec 11, Part 3). Hours are placed by their px height, so HOUR is the --s-12 token in styles.css.
export const HOUR = 48
const SNAP = 15
const DRAG_PX = 4
const DAY_MIN = 1440
const MIN_BLOCK = 20
const ALL_DAY_MAX = 3
const SCROLL_TO = 7 * 60

/** Minutes to the nearest 15, the grid's snap. */
export const snapMinutes = (m: number): number => Math.round(m / SNAP) * SNAP

/**
 * Overlap lanes (Spec 11, Part 3): spans that overlap form a cluster, and inside it each takes the first lane free at its
 * start, in start order. Every span in a cluster shares the cluster's lane count, so its width is 1 / lanes.
 */
export function layoutLanes(spans: { s: number; e: number }[]): { lane: number; lanes: number }[] {
  const out: { lane: number; lanes: number }[] = Array.from({ length: spans.length })
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].s - spans[b].s || spans[b].e - spans[a].e)
  let group: number[] = []
  let groupEnd = -Infinity
  const close = () => {
    const laneEnds: number[] = []
    const lane = new Map<number, number>()
    for (const i of group) {
      const { s, e } = spans[i]
      let l = laneEnds.findIndex((end) => end <= s)
      if (l < 0) l = laneEnds.push(e) - 1
      else laneEnds[l] = e
      lane.set(i, l)
    }
    for (const i of group) out[i] = { lane: lane.get(i)!, lanes: laneEnds.length }
    group = []
  }
  for (const i of order) {
    if (group.length && spans[i].s >= groupEnd) {
      close()
      groupEnd = -Infinity
    }
    group.push(i)
    groupEnd = Math.max(groupEnd, spans[i].e)
  }
  if (group.length) close()
  return out
}

/** A timed event's piece in one day column, in minutes from that day's midnight. */
export interface Placed {
  item: CalendarItem
  day: number
  s: number
  e: number
  lane: number
  lanes: number
}

/** Where an event shows: its own times, or the times it's being moved to. */
interface Shown {
  start: number
  end: number
}

/** Places every timed event in the seven columns, clipped to each day, with its overlap lane. */
function placeTimed(items: CalendarItem[], days: number[], shown: (item: CalendarItem) => Shown): Placed[] {
  const out: Placed[] = []
  for (let day = 0; day < 7; day++) {
    const d0 = days[day]
    const d1 = days[day + 1]
    const segs: { item: CalendarItem; s: number; e: number }[] = []
    for (const item of items) {
      if (item.allDay) continue
      const { start, end } = shown(item)
      if (end <= d0 || start >= d1) continue
      const s = start <= d0 ? 0 : minutesOf(start)
      const e = end >= d1 ? DAY_MIN : minutesOf(end)
      if (e > s) segs.push({ item, s, e })
    }
    const lanes = layoutLanes(segs)
    segs.forEach((seg, i) => out.push({ item: seg.item, day, s: seg.s, e: seg.e, ...lanes[i] }))
  }
  return out
}

interface Live {
  id: string
  day: number
  start: number
  end: number
}

interface Drag {
  item: CalendarItem
  pointer: number
  x: number
  y: number
  moved: boolean
  day: number
  /** Minutes from the event's start to where it was grabbed, so it moves with the pointer, not under it. */
  grabMin: number
  dur: number
  stop: () => void
}

interface Props {
  /** Local midnight of the first day. */
  start: number
  items: CalendarItem[]
  /** A move waiting for its save, so the block stays where it was dropped. */
  pending: { id: string; start: number; end: number } | null
  today: number
  /** Whether the first read has come back; the grid opens scrolled once it has. */
  loaded: boolean
  onOpen: (item: CalendarItem) => void
  onNew: (draft: { start: number; end: number }) => void
  onMove: (item: CalendarItem, start: number, end: number) => void
}

export function Week({ start, items, pending, today, loaded, onOpen, onNew, onMove }: Props) {
  const days = Array.from({ length: 8 }, (_, j) => addDays(start, j))
  const todayIdx = days.slice(0, 7).indexOf(today)
  const [, tick] = useState(0)
  const [live, setLive] = useState<Live | null>(null)
  const liveRef = useRef<Live | null>(null)
  const drag = useRef<Drag | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const opened = useRef(false)

  // One timer for the now line, and only while today is in view (NFR-3).
  useEffect(() => {
    if (todayIdx < 0) return
    const t = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [todayIdx])

  // Opens at 07:00, or an hour before the first event when that's earlier; once, when the first read is in.
  useLayoutEffect(() => {
    if (opened.current || !loaded || !scroll.current) return
    opened.current = true
    const firsts = items.filter((i) => !i.allDay && i.start >= start && i.start < days[7]).map((i) => Math.max(0, Math.floor(minutesOf(i.start) / 60) * 60 - 60))
    scroll.current.scrollTop = (Math.min(SCROLL_TO, ...firsts) / 60) * HOUR
  }, [loaded, items, start, days])

  const shown = (item: CalendarItem): Shown => {
    const l = live?.id === item.id ? live : pending?.id === item.id ? pending : null
    return l ? { start: l.start, end: l.end } : { start: item.start, end: item.end }
  }
  // The moving event takes its lane where it's going, so the events it lands beside make room for it.
  const placed = placeTimed(items, days, shown)
  const allDay = items.filter((i) => i.allDay)

  const columnAt = (x: number): number | null => {
    const cols = grid.current?.querySelectorAll<HTMLElement>('[data-day-col]') ?? []
    for (let j = 0; j < cols.length; j++) {
      const r = cols[j].getBoundingClientRect()
      if (x >= r.left && x < r.right) return j
    }
    return null
  }

  /** Minutes from midnight at a pointer's height, read off the grid itself, so scrolling mid-drag stays true. */
  const minuteAt = (y: number): number => ((y - (grid.current?.getBoundingClientRect().top ?? 0)) * 60) / HOUR

  const finish = (commit: boolean) => {
    const d = drag.current
    const l = liveRef.current
    drag.current = null
    liveRef.current = null
    setLive(null)
    if (!d) return
    d.stop()
    if (!d.moved) return
    // The click that follows a drag belongs to the drag: not a card opening, not a new event in the column under it.
    const swallow = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('click', swallow, true)
    setTimeout(() => window.removeEventListener('click', swallow, true), 0)
    if (commit && l && l.start !== d.item.start) onMove(d.item, l.start, l.end)
  }

  const dragging = live !== null
  useEffect(() => {
    if (!dragging) return
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      finish(false)
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish reads only refs
  }, [dragging])

  const onDown = (item: CalendarItem, e: PointerEv<HTMLButtonElement>) => {
    if (e.button !== 0 || item.readOnly || item.allDay) return
    const day = days.slice(0, 7).findIndex((d, j) => item.start >= d && item.start < days[j + 1])
    if (day < 0) return
    // Listened for on the window, not captured by the block: the block re-mounts when it crosses into another day.
    const move = (ev: PointerEvent) => ev.pointerId === e.pointerId && onDrag(ev)
    const up = (ev: PointerEvent) => ev.pointerId === e.pointerId && finish(true)
    const cancel = (ev: PointerEvent) => ev.pointerId === e.pointerId && finish(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    drag.current = { item, pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false, day, grabMin: minuteAt(e.clientY) - minutesOf(item.start), dur: item.end - item.start, stop }
  }

  // A drag still going when the week changes or the screen closes ends without a move.
  useEffect(() => () => drag.current?.stop(), [])

  const onDrag = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= DRAG_PX) return
      d.moved = true
    }
    const durMin = d.dur / 60_000
    const min = Math.max(0, Math.min(snapMinutes(minuteAt(e.clientY) - d.grabMin), DAY_MIN - durMin))
    const day = columnAt(e.clientX) ?? d.day
    const s = atMinute(days[day], min)
    const next = { id: d.item.id, day, start: s, end: s + d.dur }
    liveRef.current = next
    setLive(next)
  }

  const newAt = (day: number, minute: number) => {
    const m = Math.max(0, Math.min(minute, DAY_MIN - 60))
    onNew({ start: atMinute(day, m), end: atMinute(day, m + 60) })
  }

  const blockStyle = (top: number, len: number, lane?: number, lanes?: number) => ({
    top: (top / 60) * HOUR,
    height: Math.max(MIN_BLOCK, (len / 60) * HOUR),
    left: lanes ? `calc(${(lane! / lanes) * 100}% + 2px)` : 2,
    width: lanes ? `calc(${100 / lanes}% - 4px)` : undefined
  })

  const ghost = live ? items.find((i) => i.id === live.id) ?? null : null
  const ghostDay = ghost ? days.slice(0, 7).findIndex((d, j) => ghost.start >= d && ghost.start < days[j + 1]) : -1

  return (
    <div className="cal-week">
      <div className="cal-scroll" ref={scroll}>
        <div className="cal-row cal-head">
          <div className="cal-gutter" />
          {days.slice(0, 7).map((d, j) => {
            const date = new Date(d)
            return (
              <div key={d} className="cal-day-head">
                <span className="cal-day-head__wd">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]}</span>
                <span className={`cal-day-head__num${j === todayIdx ? ' cal-day-head__num--today' : ''}`}>{date.getDate()}</span>
              </div>
            )
          })}
        </div>
        {allDay.length > 0 && (
          <div className="cal-row cal-allday">
            <div className="cal-gutter" />
            {days.slice(0, 7).map((d, j) => {
              const here = allDay.filter((i) => i.start < days[j + 1] && i.end > d)
              return (
                <div key={d} className="cal-allday__cell">
                  {here.slice(0, ALL_DAY_MAX).map((i) => (
                    <button key={i.id} className={`cal-chip${i.readOnly ? ' cal-chip--ext' : ''}`} title={i.title} aria-label={eventLabel(i.title, i.start, i.end, true)} onClick={() => onOpen(i)}>
                      {i.title}
                    </button>
                  ))}
                  {here.length > ALL_DAY_MAX && <span className="cal-allday__more">+{here.length - ALL_DAY_MAX} more</span>}
                </div>
              )
            })}
          </div>
        )}
        <div className="cal-row cal-body-row" ref={grid}>
          <div className="cal-gutter cal-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="cal-hour">
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {days.slice(0, 7).map((d, j) => (
            <div
              key={d}
              className="cal-col"
              data-day-col={j}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                newAt(d, Math.floor(((e.clientY - r.top) * 60) / HOUR / 30) * 30)
              }}
            >
              {placed
                .filter((p) => p.day === j)
                .map((p) => {
                  const moving = live?.id === p.item.id
                  const ext = p.item.readOnly
                  const label = eventLabel(p.item.title, p.item.start, p.item.end, false)
                  return (
                    <button
                      key={`${p.item.id}:${p.day}`}
                      className={`cal-block${ext ? ' cal-block--ext' : ''}${p.item.madeBy === 'otty' ? ' cal-block--made' : ''}${moving ? ' cal-block--moving' : ''}`}
                      style={blockStyle(p.s, p.e - p.s, p.lane, p.lanes)}
                      aria-label={label}
                      title={p.item.madeBy === 'otty' ? 'Otty added this' : ext ? `${p.item.title} · ${p.item.calendar ?? p.item.source}` : p.item.title}
                      onPointerDown={(e) => onDown(p.item, e)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpen(p.item)
                      }}
                    >
                      <span className="cal-block__title">
                        {p.item.title}
                        {p.item.madeBy === 'otty' && <Icon name="paw" className="cal-block__paw" />}
                      </span>
                      {p.e - p.s >= 40 && (
                        <span className="cal-block__time">
                          {clock(atMinute(d, p.s))}–{clock(atMinute(d, p.e))}
                        </span>
                      )}
                    </button>
                  )
                })}
              {ghost && ghostDay === j && (
                <div className="cal-ghost" style={blockStyle(minutesOf(ghost.start), (ghost.end - ghost.start) / 60_000)} aria-hidden="true" />
              )}
              {j === todayIdx && (
                <div className="cal-now" style={{ top: (minutesOf(Date.now()) / 60) * HOUR }} aria-hidden="true">
                  <span className="cal-now__dot" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

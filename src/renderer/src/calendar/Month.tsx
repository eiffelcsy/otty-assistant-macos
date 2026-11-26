import type { CalendarItem } from '../../../shared/types'
import { addDays, eventLabel, longDay } from './time'

// The month grid: six weeks from the Monday on or before the 1st, so every month fits the same 42 days (main's
// longest range). A day's number opens its week; on a compact band each day is one button with a dot per event.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CHIPS = 3

interface Props {
  /** Local midnight of the grid's first day (a Monday). */
  start: number
  /** Local midnight of the month's 1st. */
  month: number
  items: CalendarItem[]
  today: number
  compact: boolean
  onOpen: (item: CalendarItem) => void
  onDay: (day: number) => void
}

export function Month({ start, month, items, today, compact, onOpen, onDay }: Props) {
  const m = new Date(month).getMonth()
  return (
    <div className="cal-month">
      <div className="cal-month__head" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-month__wd">
            {compact ? w[0] : w}
          </span>
        ))}
      </div>
      <div className="cal-month__grid">
        {Array.from({ length: 42 }, (_, j) => {
          const day = addDays(start, j)
          const next = addDays(start, j + 1)
          const here = items.filter((i) => i.start < next && i.end > day).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start)
          const cls = `cal-mday${new Date(day).getMonth() !== m ? ' cal-mday--out' : ''}${day === today ? ' cal-mday--today' : ''}`
          const label = `${longDay(day)}, ${here.length === 0 ? 'nothing planned' : here.length === 1 ? '1 event' : `${here.length} events`}`
          const num = <span className="cal-mday__num">{new Date(day).getDate()}</span>
          if (compact)
            return (
              <button key={day} className={cls} aria-label={label} onClick={() => onDay(day)}>
                {num}
                <span className="cal-mday__dots">
                  {here.slice(0, CHIPS).map((i) => (
                    <span key={i.id} className={`cal-mday__dot${i.readOnly ? ' cal-mday__dot--ext' : ''}`} />
                  ))}
                </span>
              </button>
            )
          return (
            <div key={day} className={cls}>
              <button className="cal-mday__open" aria-label={label} title="Open this week" onClick={() => onDay(day)}>
                {num}
              </button>
              {here.slice(0, CHIPS).map((i) => (
                <button key={i.id} className={`cal-chip${i.readOnly ? ' cal-chip--ext' : ''}`} title={i.title} aria-label={eventLabel(i.title, i.start, i.end, i.allDay)} onClick={() => onOpen(i)}>
                  {i.title}
                </button>
              ))}
              {here.length > CHIPS && <span className="cal-allday__more">+{here.length - CHIPS} more</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

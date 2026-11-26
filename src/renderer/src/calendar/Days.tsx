import type { CalendarItem } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { addDays, dayLabel, eventLabel, timeRange } from './time'

// The list on a compact band (Spec 11, Part 4): seven days from the range's start, one group per day.

interface Props {
  start: number
  items: CalendarItem[]
  today: number
  onOpen: (item: CalendarItem) => void
}

export function Days({ start, items, today, onOpen }: Props) {
  return (
    <div className="cal-scroll cal-list">
      {Array.from({ length: 7 }, (_, j) => {
        const day = addDays(start, j)
        const next = addDays(start, j + 1)
        const here = items.filter((i) => i.start < next && i.end > day).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start)
        const label = dayLabel(day, today)
        return (
          <section key={day} className="cal-day" aria-label={label}>
            <h3 className="cal-day__label">{label}</h3>
            {here.length === 0 ? (
              <div className="cal-day__none">Nothing planned</div>
            ) : (
              <ul className="cal-day__rows">
                {here.map((i) => (
                  <li key={i.id}>
                    <button className={`cal-row-item${i.readOnly ? ' cal-row-item--ext' : ''}`} aria-label={eventLabel(i.title, i.start, i.end, i.allDay)} onClick={() => onOpen(i)}>
                      <span className="cal-row-item__time">{timeRange(i.start, i.end, i.allDay)}</span>
                      <span className="cal-row-item__title">{i.title}</span>
                      {i.madeBy === 'otty' ? (
                        <Icon name="paw" className="cal-row-item__paw" />
                      ) : i.readOnly ? (
                        <span className="cal-row-item__cal">{i.calendar ?? i.source}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

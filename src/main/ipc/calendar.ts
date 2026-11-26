import { randomUUID } from 'crypto'
import type { EventFields } from '../../shared/types'
import { calendarRange } from '../calendar/range'
import { cleanFields, toItem } from '../calendar/fields'
import type { StoredEvent } from '../calendar/store'
import { eventStore } from '../core'
import { handle } from './check'

// D-73: the Calendar screen. Main checks every field and looks up every id; a window sends only numbers and words.
const DAY_MS = 86_400_000
const MAX_RANGE = 42 * DAY_MS

export function registerCalendar(): void {
  handle('calendar:range', async (_e, from: number, to: number) => {
    if (to <= from || to - from > MAX_RANGE) return { items: [] }
    return calendarRange(eventStore(), from, to)
  })
  handle('calendar:save', (_e, x: unknown) => {
    const fields = cleanFields(x)
    if (!fields) return null
    const store = eventStore()
    const now = Date.now()
    let event: StoredEvent
    if (fields.id !== undefined) {
      // Only one of Otty's own events can be changed; anything else is refused.
      const old = store.get(fields.id)
      if (!old) return null
      event = { ...old, ...withoutNotes(fields), updated: now }
    } else {
      event = { ...withoutNotes(fields), id: randomUUID(), madeBy: 'you', created: now, updated: now }
    }
    if (fields.notes) event.notes = fields.notes
    else delete event.notes
    store.save(event)
    return toItem(event)
  })
  handle('calendar:remove', (_e, id: string) => eventStore().remove(id))
}

/** The fields a save sets, without the id and notes, which are handled apart. */
function withoutNotes(f: EventFields): Pick<StoredEvent, 'title' | 'start' | 'end' | 'allDay'> {
  return { title: f.title, start: f.start, end: f.end, allDay: f.allDay }
}

import { useState } from 'react'
import type { CalendarItem, EventFields } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { SwitchRow } from '../panel/settings/rows'
import { addDays, atMinute, hm, parseClock, parseDay, whenWords, ymd } from './time'

// The event card (Spec 11, Part 5): add, edit, or read a connected event. It sends fields; main checks them.

export interface Draft {
  start: number
  end: number
  allDay: boolean
}

interface Props {
  /** Edit an Otty event, or read a connected one (`readOnly`). Left out, the card adds one from `draft`. */
  item?: CalendarItem
  draft?: Draft
  onSave: (fields: EventFields) => Promise<boolean>
  onDelete: (item: CalendarItem) => Promise<boolean>
  onClose: () => void
}

const SAVE_FAILED = 'That didn’t save. Try again.'

export function EventCard({ item, draft, onSave, onDelete, onClose }: Props) {
  const readOnly = item?.readOnly ?? false
  const base = item ?? draft!
  const [title, setTitle] = useState(item?.title ?? '')
  const [allDay, setAllDay] = useState(base.allDay)
  const [day, setDay] = useState(ymd(base.start))
  const [from, setFrom] = useState(hm(base.start))
  const [to, setTo] = useState(hm(base.end))
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const dayMs = parseDay(day)
  const fromMin = parseClock(from)
  const toMin = parseClock(to)
  // All day runs from the day's midnight to the next one; a timed event needs To after From.
  const start = allDay ? dayMs : atMinute(dayMs, fromMin)
  const end = allDay ? addDays(dayMs, 1) : atMinute(dayMs, toMin)
  const valid = title.trim().length > 0 && !Number.isNaN(dayMs) && (allDay || (!Number.isNaN(fromMin) && !Number.isNaN(toMin) && end > start))

  const heading = readOnly ? item!.title : item ? 'Edit event' : 'New event'

  const save = async () => {
    if (!valid || busy || readOnly) return
    setBusy(true)
    setFailed(false)
    const ok = await onSave({ ...(item ? { id: item.id } : {}), title: title.trim(), start, end, allDay, notes: notes.trim() || undefined }).catch(() => false)
    if (!ok) {
      setBusy(false)
      setFailed(true)
    }
  }

  const remove = async () => {
    if (!item || busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onDelete(item).catch(() => false)
    if (!ok) {
      setBusy(false)
      setFailed(true)
    }
  }

  return (
    <div
      className="cal-card"
      role="dialog"
      aria-label={heading}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        } else if (e.key === 'Enter' && e.metaKey && !readOnly) {
          e.preventDefault()
          void save()
        }
      }}
    >
      <h3 className="cal-card__title">{heading}</h3>
      {readOnly ? (
        <div className="cal-card__read">
          <div className="cal-card__when">{whenWords(item!.start, item!.end, item!.allDay)}</div>
          {item!.notes && <div className="cal-card__notes">{item!.notes}</div>}
          <div className="cal-card__from">From {item!.calendar ?? item!.source}. Change it there.</div>
        </div>
      ) : (
        <>
          <label className="label">
            What
            <input className="field" autoFocus maxLength={200} placeholder="Swim practice" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="label">
            Day
            <input className="field" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <SwitchRow title="All day" on={allDay} onChange={setAllDay} />
          {!allDay && (
            <div className="cal-card__times">
              <label className="label">
                From
                <input className="field" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="label">
                To
                <input className="field" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
          )}
          <label className="label">
            Notes
            <textarea className="field" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </>
      )}
      {failed && (
        <div className="error-card">
          <Icon name="triangle-warning" />
          <div className="error-card__text">{SAVE_FAILED}</div>
        </div>
      )}
      <div className="cal-card__buttons">
        {item && !readOnly && (
          <button className="btn btn--warn btn--small" disabled={busy} onClick={() => void remove()}>
            Delete
          </button>
        )}
        <span className="cal-card__spacer" />
        <button className="btn btn--soft" onClick={onClose}>
          Cancel
        </button>
        {!readOnly && (
          <button className="btn btn--primary" disabled={!valid || busy} title="Save (⌘↵)" aria-label="Save" onClick={() => void save()}>
            Save
          </button>
        )}
      </div>
    </div>
  )
}

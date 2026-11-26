// @vitest-environment jsdom
// D-73, Spec 11: the Calendar screen's week, list, card, overlap lanes and snapping.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarItem, EventFields, OttyApi } from '../../../../shared/types'
import { Calendar } from '../Calendar'
import { EventCard } from '../EventCard'
import { layoutLanes, snapMinutes } from '../Week'
import { addDays, atMinute, dayStart, longDay, mondayOf } from '../time'

const MON = mondayOf(Date.now())
const at = (day: number, h: number, m = 0) => atMinute(addDays(MON, day), h * 60 + m)

const items: CalendarItem[] = [
  { id: 'a', title: 'Essay draft', start: at(1, 14), end: at(1, 16), allDay: false, source: 'Otty', madeBy: 'otty', readOnly: false },
  { id: 'b', title: 'Standup', start: at(0, 9), end: at(0, 9, 30), allDay: false, source: 'Apple Calendar', readOnly: true }
]

beforeEach(() => {
  window.otty = {
    calendarRange: vi.fn(async () => ({ items })),
    saveEvent: vi.fn(async (f: { title: string; start: number; end: number; allDay: boolean }) => ({ ...f, id: 'new', source: 'Otty', readOnly: false, madeBy: 'you' })),
    removeEvent: vi.fn(async () => true)
  } as unknown as OttyApi
})

afterEach(() => {
  cleanup()
})

describe('the week grid', () => {
  it('shows seven day headers and the events, with Otty’s and connected ones told apart', async () => {
    const { container } = render(<Calendar band="medium" />)
    expect(await screen.findByRole('button', { name: `Essay draft, ${longDay(at(1, 14))}, 14:00 to 16:00` })).toBeTruthy()
    expect(container.querySelectorAll('.cal-day-head')).toHaveLength(7)
    expect(container.querySelector('.cal-block--made')).toBeTruthy()
    expect(container.querySelector('.cal-block--ext')).toBeTruthy()
  })

  it('opens a connected event read-only, with the line that says where to change it', async () => {
    render(<Calendar band="medium" />)
    fireEvent.click(await screen.findByRole('button', { name: /^Standup,/ }))
    expect(screen.getByText('From Apple Calendar. Change it there.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('draws the list on a compact band from today, seven days', async () => {
    // The list starts today, so the event sits on today.
    const today = atMinute(dayStart(Date.now()), 10 * 60)
    const dentist: CalendarItem = { id: 'd', title: 'Dentist', start: today, end: today + 3_600_000, allDay: false, source: 'Otty', madeBy: 'you', readOnly: false }
    window.otty.calendarRange = vi.fn(async () => ({ items: [dentist] }))
    const { container } = render(<Calendar band="compact" />)
    expect(await screen.findByText('Dentist')).toBeTruthy()
    expect(container.querySelector('.cal-day__label')?.textContent).toBe('Today')
    expect(container.querySelector('.cal-week')).toBeNull()
    expect(container.querySelectorAll('.cal-day')).toHaveLength(7)
    expect(screen.getByText('Next 7 days')).toBeTruthy()
  })
})

describe('the event card', () => {
  const draft = { start: at(2, 10), end: at(2, 11), allDay: false }

  it('saves only with What filled and To after From', () => {
    const onSave = vi.fn(async (_f: EventFields) => true)
    render(<EventCard draft={draft} onSave={onSave} onDelete={vi.fn(async () => true)} onClose={vi.fn()} />)
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save' })
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('What'), { target: { value: 'Swim practice' } })
    expect(save.disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '10:00' } })
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '11:30' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Swim practice', allDay: false, start: at(2, 10), end: at(2, 11, 30) }))
  })

  it('shows the error card when a save fails', async () => {
    render(<EventCard draft={draft} onSave={vi.fn(async () => false)} onDelete={vi.fn(async () => true)} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What'), { target: { value: 'Swim' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('That didn’t save. Try again.')).toBeTruthy()
  })
})

describe('overlap lanes and snapping', () => {
  it('gives two overlapping events half a column each, and lone events the whole', () => {
    expect(
      layoutLanes([
        { s: 0, e: 60 },
        { s: 30, e: 90 }
      ])
    ).toEqual([
      { lane: 0, lanes: 2 },
      { lane: 1, lanes: 2 }
    ])
    expect(
      layoutLanes([
        { s: 0, e: 60 },
        { s: 60, e: 120 }
      ])
    ).toEqual([
      { lane: 0, lanes: 1 },
      { lane: 0, lanes: 1 }
    ])
  })

  it('snaps to the nearest quarter hour', () => {
    expect([snapMinutes(7), snapMinutes(8), snapMinutes(22), snapMinutes(23), snapMinutes(60)]).toEqual([0, 15, 15, 30, 60])
  })
})

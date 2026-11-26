// D-73: Otty's own events, kept in otty.db. Both backends keep rows the same way.
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../store/db'
import { MemoryEventStore, SqliteEventStore, type EventStore, type StoredEvent } from '../store'

const H = 3_600_000
const ev = (over: Partial<StoredEvent>): StoredEvent => ({ id: 'e1', title: 'Essay', start: 10 * H, end: 12 * H, allDay: false, madeBy: 'you', created: 1, updated: 1, ...over })

describe.each([
  ['memory', () => new MemoryEventStore()],
  ['sqlite', () => new SqliteEventStore(openDatabase(':memory:'))]
])('EventStore contract: %s', (_name, make: () => EventStore) => {
  it('saves, reads back and replaces an event by id', () => {
    const store = make()
    store.save(ev({ notes: 'Draft first' }))
    expect(store.get('e1')).toEqual(ev({ notes: 'Draft first' }))
    store.save(ev({ title: 'Essay, final', madeBy: 'otty', chatId: 'c1', answerId: 'a1' }))
    expect(store.get('e1')).toEqual(ev({ title: 'Essay, final', madeBy: 'otty', chatId: 'c1', answerId: 'a1' }))
    expect(store.get('missing')).toBeUndefined()
  })

  it('returns events that overlap the range, soonest first', () => {
    const store = make()
    store.save(ev({ id: 'late', start: 20 * H, end: 21 * H }))
    store.save(ev({ id: 'early', start: 9 * H, end: 10 * H + 1 }))
    store.save(ev({ id: 'ends-at-from', start: 5 * H, end: 10 * H }))
    store.save(ev({ id: 'starts-at-to', start: 12 * H, end: 13 * H }))
    expect(store.range(10 * H, 12 * H).map((e) => e.id)).toEqual(['early'])
    expect(store.range(0, 30 * H).map((e) => e.id)).toEqual(['ends-at-from', 'early', 'starts-at-to', 'late'])
  })

  it('keeps notes and the all-day flag', () => {
    const store = make()
    store.save(ev({ id: 'day', allDay: true, start: 0, end: 24 * H }))
    expect(store.get('day')).toMatchObject({ allDay: true, start: 0, end: 24 * H })
    expect(store.get('day')).not.toHaveProperty('notes')
  })

  it('removes an event, and says whether one was there', () => {
    const store = make()
    store.save(ev({}))
    expect(store.remove('e1')).toBe(true)
    expect(store.remove('e1')).toBe(false)
    expect(store.range(0, 100 * H)).toEqual([])
  })
})

describe('the database keeps events across a reopen', () => {
  it('reads what a write saved', () => {
    const db = openDatabase(':memory:')
    new SqliteEventStore(db).save(ev({ notes: 'Bring the notes' }))
    expect(new SqliteEventStore(db).get('e1')?.notes).toBe('Bring the notes')
  })
})

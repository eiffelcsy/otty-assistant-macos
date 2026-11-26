// Pebbles and the Pouch (D-77): each backend keeps, shelves, marks a gone chat and puts back the same way.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../store/db'
import { cleanShelf, MemoryPebbles, pouchItems, putBack, SqlitePebbles, undoPutBack, type PebbleStore } from '../pebbles'
import type { KeptPebble } from '../../shared/pebbles'

const pebble = (over: Partial<KeptPebble> = {}): KeptPebble => ({ kind: 'chart', title: 'Rent', drawing: 'mermaid', code: 'pie\n "a": 1', chatId: 'c1', answerId: 'a1', index: 0, kept: 100, chatTitle: 'Budget', chatAt: 90, ...over })

describe.each([
  ['memory', () => new MemoryPebbles()],
  ['sqlite', () => new SqlitePebbles(openDatabase(':memory:'))]
])('Pouch store contract: %s', (_name, make: () => PebbleStore) => {
  afterEach(() => vi.useRealTimers())

  it('keeps, keeps again without a copy, and drops', () => {
    const s = make()
    s.keep(pebble({ index: 1 }))
    s.keep(pebble({ index: 0 }))
    s.keep(pebble({ index: 1, title: 'Again' }))
    expect(s.keptIn('a1')).toEqual([0, 1])
    expect(s.count()).toBe(2)
    s.drop('a1', 0)
    expect(s.keptIn('a1')).toEqual([1])
    expect(s.keptIn('a2')).toEqual([])
  })

  it('a re-keep keeps the shelf', () => {
    const s = make()
    s.keep(pebble())
    s.setShelf('a1', 0, 'Money')
    s.keep(pebble({ title: 'Again', kept: 200 }))
    expect(s.get('a1', 0)).toMatchObject({ title: 'Again', shelf: 'Money' })
  })

  it('setShelf takes a name or null off the shelf', () => {
    const s = make()
    s.keep(pebble())
    s.setShelf('a1', 0, 'Money')
    expect(s.get('a1', 0)?.shelf).toBe('Money')
    s.setShelf('a1', 0, null)
    expect(s.get('a1', 0)?.shelf).toBeUndefined()
  })

  it('a deleted chat keeps its Pebbles, named after the chat, with no chat id in the Pouch', () => {
    const s = make()
    s.keep(pebble())
    s.chatGone('c1')
    expect(s.keptIn('a1')).toEqual([0])
    expect(pouchItems(s)).toEqual([expect.objectContaining({ answerId: 'a1', chatTitle: 'Budget', chatAt: 90, kept: 100 })])
    expect(pouchItems(s)[0]).not.toHaveProperty('chatId')
  })

  it('lists newest kept first, with no chat title falling back to "A chat"', () => {
    const s = make()
    s.keep(pebble({ answerId: 'old', kept: 1 }))
    s.keep(pebble({ answerId: 'new', kept: 9, chatTitle: undefined, chatAt: undefined }))
    expect(s.all().map((p) => p.answerId)).toEqual(['new', 'old'])
    expect(pouchItems(s)[0]).toMatchObject({ chatTitle: 'A chat', chatAt: 9 })
  })

  it('puts back and undoes within 30 s, with its shelf', () => {
    vi.useFakeTimers()
    const s = make()
    s.keep(pebble())
    s.setShelf('a1', 0, 'Money')
    expect(putBack(s, 'a1', 0)).toBe(true)
    expect(s.keptIn('a1')).toEqual([])
    expect(undoPutBack(s, 'a1', 0)).toBe(true)
    expect(s.get('a1', 0)?.shelf).toBe('Money')
  })

  it('cannot undo a put back after 30 s', () => {
    vi.useFakeTimers()
    const s = make()
    s.keep(pebble())
    putBack(s, 'a1', 0)
    vi.advanceTimersByTime(30_000)
    expect(undoPutBack(s, 'a1', 0)).toBe(false)
    expect(s.keptIn('a1')).toEqual([])
  })

  it('clears everything, and puts back nothing that is not there', () => {
    const s = make()
    s.keep(pebble())
    expect(putBack(s, 'nope', 0)).toBe(false)
    s.clear()
    expect(s.count()).toBe(0)
  })
})

describe('the Pouch database', () => {
  it('migration v13 adds the Pouch columns', () => {
    const db = openDatabase(':memory:')
    const cols = (db.prepare('pragma table_info(pebbles)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['chat_title', 'chat_at', 'shelf', 'chat_gone']))
  })
})

describe('cleanShelf', () => {
  it('trims a name, takes null off the shelf, and refuses the rest', () => {
    expect(cleanShelf('  Money ')).toBe('Money')
    expect(cleanShelf(null)).toBeNull()
    expect(cleanShelf('a'.repeat(40))).toBe('a'.repeat(40))
    expect(cleanShelf('')).toBeUndefined()
    expect(cleanShelf('   ')).toBeUndefined()
    expect(cleanShelf('a'.repeat(41))).toBeUndefined()
    expect(cleanShelf(3)).toBeUndefined()
    expect(cleanShelf(undefined)).toBeUndefined()
  })
})

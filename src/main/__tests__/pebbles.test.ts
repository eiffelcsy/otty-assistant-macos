// Pebbles, step 1: each backend keeps and forgets the same way, and they go with their chats.
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../store/db'
import { MemoryPebbles, SqlitePebbles, type PebbleStore } from '../pebbles'
import type { KeptPebble } from '../../shared/pebbles'

const pebble = (over: Partial<KeptPebble> = {}): KeptPebble => ({ kind: 'chart', title: 'Rent', drawing: 'mermaid', code: 'pie\n "a": 1', chatId: 'c1', answerId: 'a1', index: 0, kept: 100, ...over })

describe.each([
  ['memory', () => new MemoryPebbles()],
  ['sqlite', () => new SqlitePebbles(openDatabase(':memory:'))]
])('Pebble store contract: %s', (_name, make: () => PebbleStore) => {
  it('keeps, keeps again without a copy, and puts back', () => {
    const s = make()
    s.keep(pebble({ index: 1 }))
    s.keep(pebble({ index: 0 }))
    s.keep(pebble({ index: 1, title: 'Again' }))
    expect(s.keptIn('a1')).toEqual([0, 1])
    s.drop('a1', 0)
    expect(s.keptIn('a1')).toEqual([1])
    expect(s.keptIn('a2')).toEqual([])
  })

  it('forgets with its chat, by age, or all at once', () => {
    const s = make()
    s.keep(pebble())
    s.keep(pebble({ chatId: 'c2', answerId: 'a2', kept: 50 }))
    s.forgetChat('c1')
    expect(s.keptIn('a1')).toEqual([])
    s.prune(60)
    expect(s.keptIn('a2')).toEqual([])
    s.keep(pebble())
    s.clear()
    expect(s.keptIn('a1')).toEqual([])
  })
})

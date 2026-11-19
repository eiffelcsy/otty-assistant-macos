// D-46: the action ledger. Each backend keeps rows the same way, and `begin` never throws.
import { describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../store/db'
import { begin, MemoryLedger, SqliteLedger, type Ledger } from '../ledger'

describe.each([
  ['memory', () => new MemoryLedger()],
  ['sqlite', () => new SqliteLedger(openDatabase(':memory:'))]
])('Ledger contract: %s', (_name, make: () => Ledger) => {
  it('writes a row before the change, finishes it, and lists it newest first', () => {
    const log = make()
    const a = begin({ tool: 'create_reminder', chatId: 'c1', answerId: 'a1', summary: 'Adding a reminder', undo: 'none' }, log)
    expect(log.list()).toMatchObject([{ summary: 'Adding a reminder', status: 'running' }])
    a({ status: 'done', summary: 'Reminder added: Call mum' })
    begin({ tool: 'remember', chatId: 'c1', answerId: 'a2', summary: 'Noting', undo: 'memory' }, log)({ status: 'done', ref: '7', undoLabel: 'Forget “tea”' })
    expect(log.list().map((r) => r.summary)).toEqual(['Noting', 'Reminder added: Call mum'])
    expect(log.forAnswers('c1', ['a2'])).toMatchObject([{ tool: 'remember', ref: '7', undoLabel: 'Forget “tea”', status: 'done' }])
  })

  it('hides anything that looks like a key in what it writes down', () => {
    const log = make()
    begin({ tool: 'copy_to_clipboard', summary: 'Copying', undo: 'none' }, log)({ status: 'done', summary: 'Copied sk-abcdefghijklmnopqrstuvwx' })
    expect(log.list()[0].summary).toBe('Copied [hidden key]')
  })

  it('marks an undo, and forgets with its chat, by age, or all at once', () => {
    const log = make()
    begin({ tool: 'remember', chatId: 'c1', answerId: 'a1', summary: 'x', undo: 'memory' }, log)({ status: 'done', ref: '7' })
    begin({ tool: 'start_job', chatId: 'c2', answerId: 'a2', summary: 'y', undo: 'job' }, log)({ status: 'done', ref: 'j1' })
    log.markUndone('c1', 'memory', '7')
    expect(log.list().find((r) => r.chatId === 'c1')?.undoneAt).toBeTruthy()
    expect(log.get(log.list()[0].id)?.summary).toBe(log.list()[0].summary)
    log.forgetChat('c1')
    expect(log.list().map((r) => r.chatId)).toEqual(['c2'])
    log.prune(0)
    expect(log.list()).toHaveLength(1)
    log.prune(Date.now() + 1)
    expect(log.list()).toEqual([])
    begin({ tool: 'forget', summary: 'z', undo: 'memory' }, log)({ status: 'done' })
    log.clear()
    expect(log.list()).toEqual([])
  })
})

describe('begin', () => {
  it('does nothing without a ledger, and never throws when one fails', () => {
    expect(() => begin({ tool: 't', summary: 's', undo: 'none' }, null)({ status: 'done' })).not.toThrow()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = { start: () => { throw new Error('disk') } } as unknown as Ledger
    expect(() => begin({ tool: 't', summary: 's', undo: 'none' }, broken)({ status: 'done' })).not.toThrow()
  })
})

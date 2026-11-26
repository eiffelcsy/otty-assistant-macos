import { describe, expect, it, vi } from 'vitest'
import { runLoop, type LoopOptions } from '../loop'
import { FriendlyError } from '../providers/errors'
import type { Message, Provider, ProviderEvent } from '../providers/types'

vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('../tools', () => ({
  toolLabel: () => ({ label: 'x', icon: 'x' }),
  runTool: async () => ({ result: 'ok', status: 'done' })
}))

const tooLong = () => new FriendlyError('This chat has grown too long. Please start a new one.', 'too-long')
const say = (text: string): ProviderEvent[] => [{ type: 'text', text }, { type: 'done', stop: 'end' }]

function rig(turns: (ProviderEvent[] | (() => never))[], history: Message[]) {
  const requests: Message[][] = []
  const provider: Provider = {
    async *stream(req, signal) {
      requests.push([...req.messages])
      if (signal.aborted) throw new Error('aborted')
      const turn = turns.shift() ?? say('done')
      yield* typeof turn === 'function' ? turn() : turn
    },
    complete: async () => ({ text: '' })
  }
  const rooms: number[] = []
  const opts: LoopOptions = {
    provider: () => provider,
    system: 's',
    history,
    tools: () => [],
    context: { allowed: new Set(), taint: { private: false, outside: false } } as unknown as LoopOptions['context'],
    maxRounds: 3,
    signal: new AbortController().signal,
    onEvent: () => {},
    onRoom: (n) => rooms.push(n)
  }
  return { opts, requests, rooms }
}

const long = (): Message[] => [
  { role: 'user', content: 'first' },
  { role: 'tool', tool_call_id: 'c', content: 'z'.repeat(9000) },
  { role: 'assistant', content: 'mid' },
  { role: 'user', content: 'second' },
  { role: 'assistant', content: 'two' },
  { role: 'user', content: 'third' }
]

describe('runLoop making room (D-78)', () => {
  it('shortens the history once and sends the same round again', async () => {
    const history = long()
    const r = rig([() => { throw tooLong() }, say('answer')], history)
    await runLoop(r.opts)
    expect(r.requests).toHaveLength(2)
    expect(r.requests[1][1]).toMatchObject({ role: 'tool', content: expect.stringContaining('was set aside') })
    expect(r.requests[1]).toHaveLength(r.requests[0].length) // the same round, nothing added by the failed try
    expect(r.rooms).toEqual([1])
    expect(history.at(-1)).toMatchObject({ role: 'assistant', content: 'answer' })
  })

  it('throws the friendly error when it is too long again', async () => {
    const r = rig([() => { throw tooLong() }, () => { throw tooLong() }], long())
    await expect(runLoop(r.opts)).rejects.toMatchObject({ kind: 'too-long' })
    expect(r.requests).toHaveLength(2)
    expect(r.rooms).toEqual([1])
  })

  it('throws when there is nothing to set aside', async () => {
    const short: Message[] = [{ role: 'user', content: 'hi' }]
    const r = rig([() => { throw tooLong() }], short)
    await expect(runLoop(r.opts)).rejects.toMatchObject({ kind: 'too-long' })
    expect(r.requests).toHaveLength(1)
    expect(r.rooms).toEqual([])
  })
})

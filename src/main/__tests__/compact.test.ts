import { describe, expect, it } from 'vitest'
import { compactHistory } from '../compact'
import type { Message } from '../providers/types'

const big = 'x'.repeat(20000)
const history = (): Message[] => [
  { role: 'user', content: 'read it' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_page', arguments: '{}' } }], reasoning_content: 'hmm' },
  { role: 'tool', tool_call_id: 'c1', content: big },
  { role: 'tool', tool_call_id: 'c2', content: 'short' },
  { role: 'assistant', content: 'an answer', reasoning_content: 'more thinking' },
  { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:x' } }] },
  { role: 'user', content: 'y'.repeat(5000) },
  { role: 'assistant', content: 'ok' },
  { role: 'user', content: 'second last' },
  { role: 'assistant', content: 'fine', reasoning_content: 'kept' },
  { role: 'user', content: 'last' }
]

describe('compactHistory', () => {
  it('shortens tool results, pictures, long text and reasoning before the last two typed turns', () => {
    const { history: out, setAside } = compactHistory(history())
    expect(setAside).toBe(5)
    expect(out[2]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '[An earlier result (20,000 characters) was set aside to fit the chat. Ask for it again if it’s needed.]' })
    expect(out[3]).toEqual({ role: 'tool', tool_call_id: 'c2', content: 'short' })
    expect(out[1]).toEqual({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_page', arguments: '{}' } }] })
    expect(out[4]).toEqual({ role: 'assistant', content: 'an answer' })
    expect(out[5]).toEqual({ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'text', text: '[A picture was here; it was set aside to fit the chat.]' }] })
    const long = out[6] as { content: string }
    expect(long.content.startsWith('y'.repeat(1000) + '\n\n[… about 4,000 more characters')).toBe(true)
  })

  it('keeps ids, tool calls and order, and leaves the last two typed turns untouched', () => {
    const before = history()
    const { history: out } = compactHistory(before)
    expect(out.map((m) => m.role)).toEqual(before.map((m) => m.role))
    expect(out[1]).toMatchObject({ tool_calls: [{ id: 'c1' }] })
    expect(out[8]).toEqual(before[8])
    expect(out[9]).toBe(before[9]) // kept reasoning, untouched
    expect(out[10]).toBe(before[10])
  })

  it('reports nothing set aside when there is nothing to shorten or too few turns', () => {
    const small: Message[] = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]
    expect(compactHistory(small)).toEqual({ history: small, setAside: 0 })
    expect(compactHistory(small, 20).setAside).toBe(0)
  })

  it('keeps the newest two messages whole when there are too few typed turns (a job’s brief)', () => {
    const job: Message[] = [
      { role: 'user', content: 'brief' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'search_web', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'a', content: big },
      { role: 'assistant', content: null, tool_calls: [{ id: 'b', type: 'function', function: { name: 'read_page', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'b', content: big }
    ]
    const { history: out, setAside } = compactHistory(job)
    expect(setAside).toBe(1)
    expect(out[2]).toMatchObject({ content: expect.stringContaining('set aside') })
    expect(out[4]).toBe(job[4])
  })

  it('does not mutate its input', () => {
    const before = history()
    const snapshot = JSON.stringify(before)
    compactHistory(before)
    expect(JSON.stringify(before)).toBe(snapshot)
    expect(before[2]).toBe(before[2])
  })

  it('is idempotent, so a second pass sets nothing aside', () => {
    const once = compactHistory(history()).history
    expect(compactHistory(once).setAside).toBe(0)
  })
})

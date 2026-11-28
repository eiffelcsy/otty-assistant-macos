import { describe, expect, it } from 'vitest'
import { suggestionsFor } from '../suggestions'

describe('suggestionsFor', () => {
  it('starts with something for the app the user came from', () => {
    expect(suggestionsFor('Microsoft Excel', true, true)[0].text).toMatch(/freeze the top row/)
  })

  it('shows what nobody finds alone: later, big questions and memory', () => {
    const texts = suggestionsFor(null, true, true).map((s) => s.text)
    expect(texts).toEqual([expect.stringMatching(/tomorrow at 9/), expect.stringMatching(/several review sites/), expect.stringMatching(/^Remember/)])
  })

  it('leaves out what can’t work: no web with a model on this Mac, no memory with learning off', () => {
    expect(suggestionsFor(null, false, false)).toEqual([])
    expect(suggestionsFor('Safari', false, true).map((s) => s.icon)).toEqual(['text', 'alarm-clock', 'lookup'])
  })
  it('puts a goal Otty knows first, and drops Remember once Otty knows something', () => {
    const known = [{ text: 'Is learning Spanish', kind: 'goal', status: 'active' }]
    const texts = suggestionsFor(null, true, true, known).map((s) => s.text)
    expect(texts[0]).toBe('What’s one small step for learning Spanish today?')
    expect(texts.some((t) => t.startsWith('Remember'))).toBe(false)
  })

  it('ignores paused memories and everything known while learning is off', () => {
    const paused = [{ text: 'Is learning Spanish', kind: 'goal', status: 'paused' }]
    expect(suggestionsFor(null, true, true, paused).map((s) => s.icon)).toEqual(['alarm-clock', 'lookup', 'notebook'])
    expect(suggestionsFor(null, false, true, [{ ...paused[0], status: 'active' }]).map((s) => s.icon)).toEqual(['alarm-clock', 'lookup'])
  })
})

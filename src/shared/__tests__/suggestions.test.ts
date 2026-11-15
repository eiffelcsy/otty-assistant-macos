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
    expect(suggestionsFor('Safari', false, true).map((s) => s.icon)).toEqual(['text', 'alarm-clock', 'binoculars'])
  })
})

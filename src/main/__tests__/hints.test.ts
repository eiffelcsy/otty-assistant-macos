import { describe, expect, it } from 'vitest'
import { turnHints } from '../hints'

describe('turnHints', () => {
  it('asks for calculate when there are numbers to work out', () => {
    expect(turnHints({ typed: 'A 1,200 loan at 5% simple interest for 3 years: how much interest do I pay?' })).toEqual([
      '[This needs numbers worked out: use calculate for them, even easy ones.]'
    ])
    expect(turnHints({ typed: 'My fever is 38 degrees Celsius. What is that in Fahrenheit?' })).toHaveLength(1)
    expect(turnHints({ typed: 'Solve 3x + 7 = 25' })).toHaveLength(1)
  })

  it('asks for a step card for a how-to in a known app', () => {
    expect(turnHints({ typed: 'How do I freeze the top row?', app: 'Excel' })).toEqual([
      '[If the answer is steps I’ll do in Excel, use show_steps, not a numbered list.]'.replace('’', "'")
    ])
    expect(turnHints({ typed: '點樣凍結第一行？', app: 'Excel' })).toHaveLength(1)
  })

  it('asks for a step card on the Mac when there’s no app', () => {
    expect(turnHints({ typed: 'How do I take a screenshot of part of my screen?' })).toEqual([
      "[If the answer is steps I'll do on my Mac, use show_steps, not a numbered list.]"
    ])
  })

  it('nudges towards remember only when learning is on and I said something lasting', () => {
    const hint = '[I said something about myself: if it will still matter in a month, remember it.]'
    expect(turnHints({ typed: 'I’ve been learning Spanish for three months. Which flashcard app is good?', learn: true })).toEqual([hint])
    expect(turnHints({ typed: 'My daughter starts school next week, any tips?', learn: true })).toEqual([hint])
    expect(turnHints({ typed: 'I’ve been learning Spanish for three months.', learn: false })).toEqual([])
    expect(turnHints({ typed: 'I’m stuck on this step', learn: true })).toEqual([])
    expect(turnHints({ typed: 'I’m a bit confused by this error', learn: true })).toEqual([])
  })

  it('says nothing otherwise', () => {
    expect(turnHints({ typed: 'What is the capital of Australia?', app: 'Safari' })).toEqual([])
    expect(turnHints({ typed: 'How many moons does Mars have?' })).toEqual([])
    expect(turnHints({ typed: 'Is 2024 a good year for otters?' })).toEqual([])
  })
})

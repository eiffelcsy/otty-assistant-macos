import { describe, expect, it } from 'vitest'
import { bareExpression, mathTier, normalizeMath, type MathTier } from '../math'

const tiers: Record<MathTier, string[]> = {
  expression: [
    '2340*1.175',
    '17.5% of 2,340',
    '38°C to °F',
    'sqrt(2)',
    'mean(3, 7, 9)',
    '2 + 2',
    '2+2=',
    'what is 12 * 12?',
    "what's 15% of 80",
    '10 km to miles',
    '(3 + 4) * 2',
    '5!',
    '2^10',
    '100 / 7',
    '３＋４',
    '6 kg in lb',
    '100 km/h to mph',
    '3.5 * 2',
    '1,000,000 / 12',
    'round(2.567, 2)'
  ],
  calculation: [
    "What's 17.5% of 2,340 plus 8% tax?",
    'split $86.40 between 3',
    'I earn $3,200 a month and spend $1,150 on rent, what share is that?',
    'how much is 20 at 15% tip',
    'what is the average of 4, 8 and 15',
    'how many weeks is 90 days',
    '3,000 蚊打八折係幾多？',
    '計一計 120 加 30',
    '百分之二十 of 500',
    'total of 12 and 30',
    'what is 15 percent of 80 dollars'
  ],
  problem: [
    'solve 3x + 7 = 25',
    '3x + 7 = 25',
    '2x + 3y = 12 and x - y = 1',
    'prove that 2 + 2 = 4',
    'a train leaves at 3pm going 60 km/h, when does it arrive',
    'how long will it take to fill a 200 litre tank at 5 litres a minute',
    'solve this quadratic equation',
    '解方程 2x + 1 = 5',
    '求解這條方程式',
    'simplify 4/8'
  ],
  none: [
    "What's the capital of France?",
    'macOS 15.1',
    'iPhone 15 review',
    'call 555-1234',
    '2026-11-06',
    '12/25/2026',
    '15.1.2',
    'solve my wifi problem',
    'why do otters hold hands',
    'Top 10 films of 2024',
    'what does 404 mean',
    'room 12',
    '1 in 3 people like it',
    'hello',
    '點樣 upgrade 我嘅 plan？',
    '2024',
    '+852 2345 6789'
  ]
}

describe('mathTier', () => {
  for (const [tier, examples] of Object.entries(tiers)) {
    it.each(examples)(`${tier}: %s`, (text) => {
      expect(mathTier(text)).toBe(tier)
    })
  }

  it('thinks about a homework snip, but not about any snip', () => {
    expect(mathTier('solve this', true)).toBe('problem')
    expect(mathTier('呢題點計', true)).toBe('problem')
    expect(mathTier('what is this', true)).toBe('none')
  })

  it('takes well under a millisecond', () => {
    const text = 'I earn $3,200 a month and spend $1,150 on rent, what share is that? '.repeat(4)
    const at = performance.now()
    for (let i = 0; i < 1000; i++) mathTier(text)
    expect((performance.now() - at) / 1000).toBeLessThan(0.5)
  })
})

describe('normalizing', () => {
  it('reads thousands, but not arguments', () => {
    expect(normalizeMath('2,340 + 1,000,000')).toBe('2340 + 1000000')
    expect(normalizeMath('mean(1,234)')).toBe('mean(1,234)')
    expect(normalizeMath('(1,234 + 1)')).toBe('(1234 + 1)')
    expect(normalizeMath('12,34')).toBe('12,34')
  })

  it('reads symbols', () => {
    expect(normalizeMath('2×3÷4−1')).toBe('2*3/4-1')
    expect(normalizeMath('５²')).toBe('5^2')
    expect(normalizeMath('38℃')).toBe('38 degC')
    expect(normalizeMath('10% of 50')).toBe('(10 / 100) * 50')
  })

  it('takes polite words off a sum', () => {
    expect(bareExpression('What is 2 + 2?')).toBe('2 + 2')
    expect(bareExpression('= 3 * 4 =')).toBe('3 * 4')
  })
})

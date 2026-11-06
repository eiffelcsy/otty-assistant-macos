import { beforeAll, describe, expect, it } from 'vitest'
import { calculate, instantAnswer, loadMath, withSeparators } from '../math'

const one = async (s: string) => (await calculate([s])).result.split(' = ').at(-1)

beforeAll(() => loadMath())

describe('calculate', () => {
  it('keeps decimals exact', async () => {
    expect(await one('0.1 + 0.2')).toBe('0.3')
    expect(await one('19.99 * 3')).toBe('59.97')
  })

  it('does percentages, units and statistics', async () => {
    expect(await one('2340 * 17.5%')).toBe('409.5')
    expect(await one('17.5% of 2,340')).toBe('409.5')
    expect(await one('100 + 5%')).toBe('105')
    expect(await one('38 °C to °F')).toBe('100.4 degF')
    expect(await one('100 km/h to m/s')).toContain('27.77')
    expect(await one('mean(3, 7, 8)')).toBe('6')
    expect(await one('median(1, 2, 9)')).toBe('2')
    expect(await one('sqrt(16)')).toBe('4')
  })

  it('shares names across steps, in one go', async () => {
    const r = await calculate(['base = 2340 * 17.5%', 'tax = base * 8%', 'total = base + tax'])
    expect(r.result).toBe('base = 409.5\ntax = 32.76\ntotal = 442.26')
    expect(r).toMatchObject({ ok: true, label: 'Calculated total = 442.26', value: '442.26' })
  })

  it('takes what people and models actually type', async () => {
    expect(await one('2 × 3 ÷ 4 − 1')).toBe('0.5')
    expect(await one('３ + ４')).toBe('7')
    expect(await one('5²')).toBe('25')
    expect(await one('2,340 + 1')).toBe('2341')
    expect(await one('max(1,234)')).toBe('234')
  })

  it('labels the chip for people', async () => {
    expect((await calculate(['2340 * 17.5%'])).label).toBe('Calculated 2340 × 17.5% = 409.5')
    expect((await calculate(['1234 * 1000'])).label).toBe('Calculated 1234 × 1000 = 1,234,000')
  })

  it('stops at a bad step with a one-line fix, and keeps what came before', async () => {
    const r = await calculate(['a = 1 + 1', '5 kms to m', 'a + 1'])
    expect(r.ok).toBe(false)
    expect(r.result).toContain('a = 2')
    expect(r.result).toContain('did you mean “km”?')
    expect(r.result).not.toContain('a + 1')
  })

  it('accepts a single string, and refuses nothing at all', async () => {
    expect((await calculate('1 + 1')).result).toBe('1 + 1 = 2')
    expect((await calculate([])).ok).toBe(false)
  })
})

describe('what it refuses', () => {
  it.each([
    'import({})',
    'evaluate("1+1")',
    'parse("1")',
    'createUnit("otter")',
    'range(1, 1e9)',
    'zeros(1e9)',
    'factorial(1e6)',
    '1000001!',
    'x = 1e9; x!',
    'f(x) = x',
    'cos.constructor',
    '"text"',
    '{a: 1}',
    'true',
    '1 < 2',
    '1 ? 2 : 3',
    '[1,2][1]',
    '1:1000000000'
  ])('%s', async (s) => {
    expect((await calculate([s])).ok).toBe(false)
  })

  it('refuses a factorial of a name, since only a plain number has a known size', async () => {
    expect((await calculate(['x = 1000000', 'x!'])).ok).toBe(false)
  })

  it('refuses long input', async () => {
    expect((await calculate(['1+'.repeat(300) + '1'])).ok).toBe(false)
    expect((await calculate(Array(31).fill('1'))).ok).toBe(false)
  })

  it('says so for a sum with no number for an answer', async () => {
    expect((await calculate(['1 / 0'])).ok).toBe(false)
    expect((await calculate(['sqrt(-1)'])).ok).toBe(false)
  })

  it('stays fast whatever it’s given', async () => {
    const mix = ['2340 * 17.5%', '38 degC to degF', 'mean(1,2,3,4)', 'sqrt(2) * pi', '2^0.5', '2^(10^10)', '170!', 'std(1,2,3)']
    const times: number[] = []
    for (let i = 0; i < 1000; i++) {
      const at = performance.now()
      await calculate([mix[i % mix.length]])
      times.push(performance.now() - at)
    }
    // The target is 2 ms. This runs beside every other test file, so it only catches a real slowdown.
    expect(times.sort((a, b) => a - b)[950]).toBeLessThan(6)
  })
})

describe('instant answers', () => {
  it('answers a typed sum, with separators for people', async () => {
    expect(await instantAnswer('17.5% of 2,340')).toEqual({ expression: '17.5% of 2,340', result: '409.5' })
    expect(await instantAnswer('2340*1.175')).toMatchObject({ result: '2,749.5' })
    expect(await instantAnswer('what is 2 + 2?')).toMatchObject({ result: '4' })
    expect(await instantAnswer('38°C to °F')).toMatchObject({ result: '100.4 degF' })
  })

  it('leaves anything it can’t read to the model', async () => {
    expect(await instantAnswer('2 apples + 3 pears')).toBeNull()
    expect(await instantAnswer('1 / 0')).toBeNull()
  })

  it('formats big and small numbers plainly', () => {
    expect(withSeparators('1234567.5')).toBe('1,234,567.5')
    expect(withSeparators('-1234')).toBe('-1,234')
    expect(withSeparators('999')).toBe('999')
    expect(withSeparators('0.12345')).toBe('0.12345')
  })
})

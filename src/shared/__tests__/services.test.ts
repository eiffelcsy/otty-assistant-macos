import { describe, expect, it } from 'vitest'
import { serviceAt, serviceById, SERVICES } from '../services'

describe('serviceAt', () => {
  it.each([
    ['https://api.deepseek.com', 'deepseek'],
    ['https://api.anthropic.com', 'claude'],
    ['https://api.openai.com/v1', 'openai'],
    ['http://localhost:11434/v1', 'local'],
    ['https://api.deepseek.com.evil.example', 'custom'],
    ['', 'custom']
  ])('reads %s as %s', (url, id) => {
    expect(serviceAt(url)).toBe(id)
  })

  it('finds every preset at its own address', () => {
    for (const s of SERVICES) expect(serviceAt(s.baseUrl)).toBe(s.id)
  })
})

describe('presets', () => {
  it('start Claude on Sonnet 5.5', () => {
    expect(serviceById('claude').model).toBe('claude-sonnet-5-5')
  })

  it('tell the truth about a local model', () => {
    const local = serviceById('local')
    expect(local.needsKey).toBe(false)
    expect(local.privacy).toContain('stays on this Mac')
  })

  it('have somewhere to get a key when one is needed', () => {
    for (const s of SERVICES) if (s.needsKey) expect(s.keyUrl).toMatch(/^https:/)
  })
})

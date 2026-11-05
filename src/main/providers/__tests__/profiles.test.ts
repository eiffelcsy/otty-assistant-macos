import { describe, expect, it } from 'vitest'
import { profileFor } from '../profiles'

describe('profileFor', () => {
  it.each([
    ['https://api.deepseek.com', 'deepseek'],
    ['https://api.deepseek.com/v1/', 'deepseek'],
    ['https://api.openai.com/v1', 'openai'],
    ['http://localhost:11434/v1', 'local'],
    ['http://127.0.0.1:1234/v1', 'local'],
    ['http://[::1]:11434/v1', 'local'],
    ['http://ollama.localhost:11434/v1', 'local'],
    ['https://models.example.com/v1', 'custom'],
    ['http://192.168.1.20:11434/v1', 'custom'],
    ['https://api.deepseek.com.evil.example', 'custom'],
    ['https://localhost.evil.example', 'custom'],
    ['not an address', 'custom'],
    ['', 'custom']
  ])('reads %s as %s', (url, id) => {
    expect(profileFor(url).id).toBe(id)
  })

  it('keeps everything on the Mac for a local model', () => {
    const local = profileFor('http://localhost:11434/v1')
    expect(local.web).toBe('off')
    expect(local.needsKey).toBe(false)
  })

  it('leaves DeepSeek as it was', () => {
    expect(profileFor('https://api.deepseek.com')).toMatchObject({ needsKey: true, contextTokens: 128_000, reasoning: 'thinking-field', web: 'deepseek' })
  })
})

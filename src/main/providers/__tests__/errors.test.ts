import { describe, expect, it } from 'vitest'
import { friendlyStatus } from '../errors'
import { profileFor } from '../profiles'

const profile = profileFor('https://api.deepseek.com')

describe('friendlyStatus: too long', () => {
  it.each([
    [400, "This model's maximum context length is 131072 tokens. However, you requested 140000 tokens."],
    [400, '{"error":{"code":"context_length_exceeded"}}'],
    [400, 'prompt is too long: 250000 tokens > 200000 maximum'],
    [400, 'Requested too many tokens for this model'],
    [400, 'Please reduce the length of the messages.'],
    [413, 'request entity too large']
  ])('status %i with %j is too-long', (status, body) => {
    const err = friendlyStatus(status, body, profile)
    expect(err.kind).toBe('too-long')
    expect(err.message).toBe('This chat has grown too long. Please start a new one.')
  })

  it('leaves other 400s alone', () => {
    expect(friendlyStatus(400, 'invalid parameter', profile).kind).toBe('other')
  })

  it('a too-long body on a 500 is not too-long', () => {
    expect(friendlyStatus(500, 'maximum context length', profile).kind).toBe('other')
  })
})

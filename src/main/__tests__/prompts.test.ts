import { describe, expect, it } from 'vitest'
import { systemPrompt } from '../prompts'

describe('systemPrompt', () => {
  // D-69: the tip was on most answers and made each longer; explain links and "In more detail" teach on demand.
  it('no longer asks for a Good to know tip', () => {
    for (const web of [true, false]) expect(systemPrompt(null, web, true)).not.toMatch(/💡|Good to know/)
  })
})

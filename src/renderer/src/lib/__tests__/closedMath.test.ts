import { describe, expect, it } from 'vitest'
import { closedMath } from '../closedMath'

describe('closedMath', () => {
  it('leaves finished math alone', () => {
    expect(closedMath('a $$x$$ b $$y$$')).toBe('a $$x$$ b $$y$$')
  })

  it('keeps an unfinished one as text, and the finished ones before it as math', () => {
    expect(closedMath('a $$x$$ b $$y')).toBe('a $$x$$ b \\$\\$y')
    expect(closedMath('$$')).toBe('\\$\\$')
  })
})

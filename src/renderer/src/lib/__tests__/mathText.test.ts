import { describe, expect, it } from 'vitest'
import { tidyMath } from '../mathText'

describe('tidyMath', () => {
  it('turns single-dollar math into $$', () => {
    expect(tidyMath('Take $A = P D P^{-1}$ ok')).toBe('Take $$A = P D P^{-1}$$ ok')
    expect(tidyMath('where $A$ is a matrix')).toBe('where $$A$$ is a matrix')
  })
  it('leaves prices and code alone', () => {
    for (const t of ['It costs $5 and $10 today', 'Between $5-$10', 'Pay $5, or $10.', 'run `echo $A=$B` now', '```\n$x^2$\n```']) {
      expect(tidyMath(t)).toBe(t)
    }
  })
  it('fixes a check mark inside math', () => {
    expect(tidyMath('$$A = B \\✓$$')).toBe('$$A = B \\checkmark $$')
    expect(tidyMath('$$A = B ✓$$')).toBe('$$A = B \\checkmark $$')
  })
})

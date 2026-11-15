import { describe, expect, it } from 'vitest'
import { looksLikeCode, stripLineNumbers } from '../code'

describe('looksLikeCode', () => {
  it('spots code and stack traces', () => {
    expect(looksLikeCode('def area(r):\n    return 3.14 * r * r')).toBe(true)
    expect(looksLikeCode('const x = items.map((i) => i * 2);\nconsole.log(x);')).toBe(true)
    expect(looksLikeCode('Traceback (most recent call last):\n  File "a.py", line 3, in <module>\nKeyError: \'rivr\'')).toBe(true)
    expect(looksLikeCode('SELECT name FROM otters\nWHERE river = 1;')).toBe(true)
  })

  it('leaves prose alone, even with a bracket or two', () => {
    expect(looksLikeCode('The tenant must give one month of notice (in writing).\nThe landlord keeps the deposit.')).toBe(false)
    expect(looksLikeCode('Dear Sam,\nThanks for the update: it looks great!\nSee you Monday.')).toBe(false)
    expect(looksLikeCode('x = 1')).toBe(false)
  })

  it('trusts a code editor or terminal more', () => {
    expect(looksLikeCode('npm run build', 'Terminal')).toBe(false)
    expect(looksLikeCode('result = compute(x)', 'Visual Studio Code')).toBe(true)
    expect(looksLikeCode('error: build failed\nsee the log', 'Xcode')).toBe(true)
  })
})

describe('stripLineNumbers', () => {
  it('drops Otty’s own line numbers only when every line has one', () => {
    expect(stripLineNumbers(' 9│ a = 1\n10│ b = 2')).toBe('a = 1\nb = 2')
    expect(stripLineNumbers('1│ a\nplain')).toBe('1│ a\nplain')
  })
})

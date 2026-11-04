import { describe, expect, it } from 'vitest'
import { isMostlyHan, isShortPhrase } from '../../shared/script'
import { defaultHomeLanguage, languageGuide, languageReminder, resolveLanguage, translateTarget, turnNote, withNote } from '../language'

describe('isMostlyHan', () => {
  it('counts Han characters against words', () => {
    expect(isMostlyHan('這是什麼意思？')).toBe(true)
    expect(isMostlyHan('How do I save this as a PDF?')).toBe(false)
    expect(isMostlyHan('123 !!')).toBe(false)
    expect(isMostlyHan('')).toBe(false)
  })

  it('handles mixed messages near the 30% line', () => {
    expect(isMostlyHan('PDF 點樣 save?')).toBe(true) // 2 Han of 4 units
    expect(isMostlyHan('點樣 open Settings')).toBe(true) // Chinese question, English labels
    expect(isMostlyHan('Can you explain this 字')).toBe(false) // 1 of 6
    expect(isMostlyHan('What does 應用 mean in this error message?')).toBe(false) // 2 of 9
  })
})

describe('isShortPhrase', () => {
  it('accepts up to five English words', () => {
    expect(isShortPhrase('latency')).toBe(true)
    expect(isShortPhrase('  rate limit exceeded  ')).toBe(true)
    expect(isShortPhrase('one two three four five six')).toBe(false)
    expect(isShortPhrase('應用程式')).toBe(false)
    expect(isShortPhrase('a\nb')).toBe(false)
  })
})

describe('defaultHomeLanguage', () => {
  it('defaults Hong Kong and Macau Macs to zh-HK', () => {
    expect(defaultHomeLanguage(['en-GB', 'zh-Hant-HK'])).toBe('zh-HK')
    expect(defaultHomeLanguage(['zh_HK'])).toBe('zh-HK')
    expect(defaultHomeLanguage(['zh-MO'])).toBe('zh-HK')
  })

  it('leaves Taiwan and everyone else with none', () => {
    expect(defaultHomeLanguage(['zh-TW', 'zh-Hant-TW'])).toBeNull()
    expect(defaultHomeLanguage(['en-US'])).toBeNull()
    expect(defaultHomeLanguage([])).toBeNull()
  })
})

describe('resolveLanguage', () => {
  const home = 'zh-HK' as const

  it('is always English with no home language', () => {
    expect(resolveLanguage({ typed: '這是什麼意思？', home: null })).toBe('en')
    expect(resolveLanguage({ typed: '', action: 'translate', selection: 'hello', home: null })).toBe('en')
  })

  it('lets an explicit pick win', () => {
    expect(resolveLanguage({ typed: '這是什麼意思？', picked: 'en', home })).toBe('en')
    expect(resolveLanguage({ typed: 'What is this?', picked: 'zh-HK', home })).toBe('zh-HK')
  })

  it('follows actions that imply a language', () => {
    expect(resolveLanguage({ typed: '', action: 'explain-home', home })).toBe('zh-HK')
    expect(resolveLanguage({ typed: '', action: 'translate', selection: 'Save as PDF', home })).toBe('zh-HK')
    expect(resolveLanguage({ typed: '', action: 'translate', selection: '另存為 PDF', home })).toBe('en')
    expect(resolveLanguage({ typed: '', action: 'summarize', home })).toBe('en')
  })

  it('replies in kind to what was typed, otherwise English', () => {
    expect(resolveLanguage({ typed: '這是什麼意思？', home })).toBe('zh-HK')
    expect(resolveLanguage({ typed: 'What does this mean?', home })).toBe('en')
    // A Chinese selection with no prompt still gets English: the user works in English.
    expect(resolveLanguage({ typed: '', selection: '這是一段中文', home })).toBe('en')
  })
})

describe('translateTarget', () => {
  it('goes the other way from the selection', () => {
    expect(translateTarget('Hello there', 'zh-HK')).toBe('zh-HK')
    expect(translateTarget('你好', 'zh-HK')).toBe('en')
  })
})

describe('languageGuide', () => {
  it('adds nothing for English-only users', () => {
    expect(languageGuide(null)).toBe('')
  })

  it('asks for HK vocabulary and English screen labels', () => {
    const g = languageGuide('zh-HK')
    expect(g).toContain('打印')
    expect(g).toContain('Traditional characters only')
    expect(g).toContain('「File」')
  })
})

describe('turnNote', () => {
  const now = new Date(2026, 10, 4, 23, 51, 13)

  it('gives the time to the minute, with no seconds', () => {
    const note = turnNote('en', null, now)
    expect(note).toMatch(/^\[Current local time: .*2026.*23:51 \(UTC[+-]\d\d:\d\d\)\]$/)
    expect(note).not.toContain('23:51:13')
  })

  it('stays the same within a minute', () => {
    expect(turnNote('en', null, now)).toBe(turnNote('en', null, new Date(2026, 10, 4, 23, 51, 59)))
  })

  it('adds the answer language when a home language is set', () => {
    expect(turnNote('zh-HK', 'zh-HK', now)).toContain('even if I wrote in English')
    expect(turnNote('en', 'zh-HK', now)).toContain('Please reply in English')
  })

  it('leaves the guide to the system prompt when it has it', () => {
    expect(turnNote('zh-HK', 'zh-HK', now)).not.toContain('打印')
  })

  it('brings the guide along when the system prompt lacks it', () => {
    expect(turnNote('zh-HK', null, now)).toContain('打印')
  })
})

describe('languageReminder', () => {
  it('asks for Chinese even when the question is English', () => {
    expect(languageReminder('zh-HK', 'zh-HK')).toContain('even if I wrote in English')
  })

  it('adds nothing for English-only users', () => {
    expect(languageReminder('en', null)).toBe('')
  })

  it('pins English when a home language is set', () => {
    expect(languageReminder('en', 'zh-HK')).toContain('English')
  })
})

describe('withNote', () => {
  it('appends to text', () => {
    expect(withNote('What is a CDN?', '(Reply in X.)')).toBe('What is a CDN?\n\n(Reply in X.)')
  })

  it('adds a text part after a picture', () => {
    const parts = [{ type: 'image_url' as const, image_url: { url: 'data:' } }]
    expect(withNote(parts, '(Reply in X.)')).toEqual([...parts, { type: 'text', text: '(Reply in X.)' }])
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { Capture } from '../../shared/types'
import { addCapture, MAX_CAPTURES } from '../../shared/captures'

vi.mock('electron', () => ({ nativeImage: {}, app: { getPath: () => '' } }))
vi.mock('../settings', () => ({ getStored: () => ({}), getApiKey: () => '' }))
const { titleFor, userContent } = await import('../llm')

const text = (id: string, t: string, app: Capture['app'] = null): Capture => ({ id, context: { kind: 'text', text: t }, app })
const snip = (id: string, url: string, app: Capture['app'] = null): Capture => ({
  id,
  context: { kind: 'image', dataUrl: url, width: 1, height: 1 },
  app
})

describe('addCapture', () => {
  it('adds to the end, ignores the same text twice and stops at the limit', () => {
    let tray: Capture[] = []
    for (let i = 0; i < MAX_CAPTURES; i++) {
      const r = addCapture(tray, { kind: 'text', text: `t${i}` }, null, `c${i}`)
      if (!r.ok) throw new Error(r.reason)
      tray = r.captures
    }
    expect(tray.map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3'])
    expect(addCapture(tray.slice(0, 2), { kind: 'text', text: 't1' }, null, 'x')).toEqual({ ok: false, reason: 'duplicate' })
    expect(addCapture(tray, { kind: 'text', text: 'new' }, null, 'x')).toEqual({ ok: false, reason: 'full' })
  })
})

describe('userContent', () => {
  it('says when a picture is the whole screen', () => {
    const whole: Capture = { id: 'w', context: { kind: 'image', dataUrl: 'data:w', width: 1, height: 1, wholeScreen: true }, app: null }
    const one = userContent('What is this?', [whole], null) as { type: string; text?: string }[]
    expect(one.at(-1)?.text).toContain('This is a picture of my whole screen.')
    const two = userContent('Compare', [whole, snip('b', 'data:b')], null) as { type: string; text?: string }[]
    expect(two.at(-1)?.text).toContain('A picture of my whole screen: picture 1.')
    expect(two.at(-1)?.text).toContain('A snip of part of my screen: picture 2.')
  })

  it('keeps the one-capture wording', () => {
    const body = userContent('Explain', [text('a', 'hello', { name: 'Safari' })], null)
    expect(body).toBe(`[I'm using Safari.]\n\nHere is the text I highlighted on my screen:\n"""\nhello\n"""\n\nExplain`)
  })

  it('labels several captures with their apps and numbers the pictures in order', () => {
    const body = userContent(
      'Why do these differ?',
      [snip('a', 'data:a', { name: 'Terminal' }), text('b', 'docs say 3', { name: 'Safari', title: 'Docs' }), snip('c', 'data:c')],
      { name: 'Ignored' }
    )
    expect(Array.isArray(body)).toBe(true)
    const parts = body as Exclude<typeof body, string>
    expect(parts.slice(0, 2).map((p) => p.type === 'image_url' && p.image_url.url)).toEqual(['data:a', 'data:c'])
    const words = parts[2].type === 'text' ? parts[2].text : ''
    expect(words).toContain('[Capture 1 · from Terminal] A snip of part of my screen: picture 1.')
    expect(words).toContain('[Capture 2 · from Safari (“Docs”)] Text I highlighted:\n"""\ndocs say 3\n"""')
    expect(words).toContain('[Capture 3] A snip of part of my screen: picture 2.')
    expect(words).not.toContain('Ignored')
    expect(words.endsWith('Why do these differ?')).toBe(true)
  })

  it('titles a chat after its first highlighted capture', () => {
    expect(titleFor('Compare', [text('a', 'Annual plans save twenty percent on every seat')])).toBe(
      'Compare “Annual plans save twenty percent on ever…”'
    )
  })
})

import { describe, expect, it } from 'vitest'
import type { Capture, FileAttachment } from '../../../../shared/types'
import { actionsFor, actionsForTray, withMyTiles } from '../QuickActions'

const article = { name: 'Safari', url: 'https://example.com/story' }
const offered = (page: Parameters<typeof actionsForTray>[3], captures: Capture[] = [], files: FileAttachment[] = []) =>
  actionsForTray(captures, files, null, page).map((a) => a.action)

describe('the page offer', () => {
  it('offers to summarize the page when Otty knows it and nothing is highlighted', () => {
    expect(offered({ app: article, readsPages: true })).toEqual(['read-page'])
  })

  it('goes away with the app tag', () => {
    expect(offered({ app: null, readsPages: true })).toEqual([])
  })

  it('needs an address', () => {
    expect(offered({ app: { name: 'Notes' }, readsPages: true })).toEqual([])
  })

  it('stays away from an address that lost a query that matters', () => {
    expect(offered({ app: { ...article, trimmed: true }, readsPages: true })).toEqual([])
  })

  it('stays away when nothing may leave the Mac', () => {
    expect(offered({ app: article, readsPages: false })).toEqual([])
  })

  it('gives way to captures and files', () => {
    const capture: Capture = { id: 'a', context: { kind: 'text', text: 'Hello there, this is a sentence.' }, app: null }
    const file = { id: 'f', name: 'a.txt', kind: 'text' } as FileAttachment
    expect(offered({ app: article, readsPages: true }, [capture])).not.toContain('read-page')
    expect(offered({ app: article, readsPages: true }, [], [file])).not.toContain('read-page')
  })
})

describe('checking writing', () => {
  const actions = (text: string) => actionsFor({ kind: 'text', text }, null).map((a) => a.action)

  it('is offered for a draft, without becoming the default', () => {
    const offered = actions('I has two cat and they is very friendly, and we goes to the park every day.')
    expect(offered).toContain('proofread')
    expect(offered[0]).not.toBe('proofread')
  })

  it('isn’t offered for a word or a picture', () => {
    expect(actions('idempotent')).not.toContain('proofread')
    expect(actionsFor({ kind: 'image', dataUrl: 'x', width: 1, height: 1 }, null).map((a) => a.action)).not.toContain('proofread')
  })
})

describe('code', () => {
  it('offers code actions for highlighted code', () => {
    const offered = actionsFor({ kind: 'text', text: 'def area(r):\n    return 3.14 * r * r' }, null).map((a) => a.action)
    expect(offered).toEqual(['explain-code', 'find-problems', 'add-comments'])
  })

  it('offers them for code files and notebooks, but not for a mix with documents', () => {
    const py = { id: 'a', name: 'a.py', kind: 'code' } as FileAttachment
    const nb = { id: 'b', name: 'b.ipynb', kind: 'notebook' } as FileAttachment
    const pdf = { id: 'c', name: 'c.pdf', kind: 'pdf' } as FileAttachment
    expect(actionsForTray([], [py, nb], null).map((a) => a.action)[0]).toBe('explain-code')
    expect(actionsForTray([], [py, pdf], null).map((a) => a.action)[0]).toBe('summarize')
  })
})

describe('my own tiles (D-56)', () => {
  it('come after the built-in ones, and carry their prompt to send as typed', () => {
    const captures: Capture[] = [{ id: 'c', context: { kind: 'text', text: 'A sentence about otters and rivers.' }, app: null }]
    const mine = [
      { id: 'a', name: 'Flashcards', icon: 'layers', prompt: 'Turn this into flashcards.', when: 'text' as const },
      { id: 'b', name: 'Fix my code', icon: 'bulb', prompt: 'Fix it.', when: 'code' as const }
    ]
    const items = withMyTiles(actionsForTray(captures, [], null), mine, captures, [])
    expect(items[0].action).toBe('explain')
    expect(items.at(-1)).toEqual({ label: 'Flashcards', icon: 'layers', prompt: 'Turn this into flashcards.' })
    expect(items.some((i) => i.label === 'Fix my code')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import type { Capture, FileAttachment } from '../../../../shared/types'
import { actionsForTray } from '../QuickActions'

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

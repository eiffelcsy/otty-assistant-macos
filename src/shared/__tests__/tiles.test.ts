import { describe, expect, it } from 'vitest'
import { tilesFor, type MyTile } from '../tiles'
import type { Capture, FileAttachment } from '../types'

const tile = (when: MyTile['when']): MyTile => ({ id: when, name: when, icon: 'star', prompt: `p-${when}`, when })
const ALL = (['any', 'text', 'code', 'picture', 'table', 'file', 'page'] as const).map(tile)
const text = (t: string): Capture => ({ id: 'c', context: { kind: 'text', text: t }, app: null })
const names = (t: MyTile[]) => t.map((x) => x.when)

describe('tiles for the tray (D-56)', () => {
  it('shows a tile only for its kind of capture', () => {
    expect(names(tilesFor(ALL, [text('A plain sentence about otters.')], []))).toEqual(['any', 'text'])
    expect(names(tilesFor(ALL, [text('const x = () => {\n  return 1\n}')], []))).toEqual(['any', 'code'])
    expect(names(tilesFor(ALL, [text('name,age\nAda,36\nBo,4')], []))).toEqual(['any', 'table'])
    expect(names(tilesFor(ALL, [{ id: 'c', context: { kind: 'image', dataUrl: '', width: 1, height: 1 }, app: null }], []))).toEqual(['any', 'picture'])
    expect(names(tilesFor(ALL, [], [{ kind: 'pdf' } as FileAttachment]))).toEqual(['any', 'file'])
  })

  it('offers page tiles with nothing highlighted, and nothing with an empty tray', () => {
    expect(names(tilesFor(ALL, [], [], { name: 'Safari', url: 'https://example.com' }))).toEqual(['page'])
    expect(tilesFor(ALL, [], [])).toEqual([])
  })

  it('keeps several things together to "any"', () => {
    expect(names(tilesFor(ALL, [text('one'), text('two')], []))).toEqual(['any'])
  })
})

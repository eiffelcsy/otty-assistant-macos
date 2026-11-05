import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))
const { parseLines } = await import('../ocr')

const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.04 }

describe('parseLines', () => {
  it('reads what the helper prints', () => {
    expect(parseLines(JSON.stringify({ lines: [{ text: 'Hello', box }] }))).toEqual([{ text: 'Hello', box }])
  })

  it('treats no words as an answer, not a failure', () => {
    expect(parseLines('{"lines":[]}')).toEqual([])
  })

  it('skips blank or malformed lines', () => {
    const lines = [{ text: '  ', box }, { text: 'No box' }, { text: 'Bad box', box: { ...box, w: null } }, { text: 'Fine', box }]
    expect(parseLines(JSON.stringify({ lines }))).toEqual([{ text: 'Fine', box }])
  })

  it('returns null for anything else', () => {
    expect(parseLines('not json')).toBeNull()
    expect(parseLines('{}')).toBeNull()
  })
})

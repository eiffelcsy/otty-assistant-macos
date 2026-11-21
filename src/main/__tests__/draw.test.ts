import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, clipboard: {}, ClipboardItem: class {}, dialog: {}, screen: {}, session: {} }))
const { validExport, validView } = await import('../draw')

describe('what main accepts from a drawing card', () => {
  it('takes an SVG picture or a deck, and nothing else', () => {
    expect(validExport({ kind: 'picture', svg: 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E', width: 10, height: 5, background: '#fff', name: 'Otty diagram' })).toMatchObject({ kind: 'picture', width: 10 })
    expect(validExport({ kind: 'slides', html: '<!doctype html>', name: 'Otty slides' })).toMatchObject({ kind: 'slides' })
    expect(validExport({ kind: 'picture', svg: 'https://evil.example/p.svg', width: 10, height: 5 })).toBeNull()
    expect(validExport({ kind: 'picture', svg: 'data:text/html,<script>', width: 10, height: 5 })).toBeNull()
    expect(validExport({ kind: 'picture', svg: 'data:image/svg+xml,x', width: 0, height: 5 })).toBeNull()
    expect(validExport({ kind: 'file', path: '/etc/passwd' })).toBeNull()
    expect(validExport(null)).toBeNull()
  })

  it('keeps a file name to a name', () => {
    expect(validExport({ kind: 'slides', html: 'x', name: '../../Library/evil' })?.name).toBe('.. .. Library evil')
  })

  it('opens only pictures and slide pages in the bigger view', () => {
    expect(validView({ kind: 'picture', dataUrl: 'data:image/svg+xml,x', width: 1, height: 1 })).toMatchObject({ kind: 'picture' })
    expect(validView({ kind: 'picture', dataUrl: 'https://evil.example/x.svg' })).toBeNull()
    expect(validView({ kind: 'picture', dataUrl: 'data:image/png;base64,AAAA' })).toMatchObject({ kind: 'picture', screenshot: true })
    expect(validView({ kind: 'picture', dataUrl: 'data:image/png,AAAA' })).toBeNull()
    expect(validView({ kind: 'picture', dataUrl: 'data:text/html;base64,AAAA' })).toBeNull()
    expect(validView({ kind: 'slides', pages: ['<section>'], notes: [['Say hi', 3]], present: true })).toEqual({ kind: 'slides', pages: ['<section>'], notes: [['Say hi']], present: true })
    expect(validView({ kind: 'slides', pages: [1] })).toBeNull()
  })
})

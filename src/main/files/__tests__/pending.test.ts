import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, BrowserWindow: {}, dialog: {}, nativeImage: {}, utilityProcess: {}, screen: {}, clipboard: {}, desktopCapturer: {} }))
const { pendingFiles, registerFiles } = await import('../index')

describe('pendingFiles (D-37)', () => {
  it('names only files main registered, so the bubble can’t name one it didn’t drop', () => {
    const [a] = registerFiles(['/Users/me/report.pdf'])
    expect(pendingFiles([a.id, 'made-up'])).toEqual([{ id: a.id, name: 'report.pdf' }])
  })
})

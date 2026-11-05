import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSources, status } = vi.hoisted(() => ({ getSources: vi.fn(), status: { value: 'granted' } }))

vi.mock('electron', () => ({
  clipboard: {},
  ClipboardItem: class {},
  nativeImage: {},
  desktopCapturer: { getSources },
  systemPreferences: { getMediaAccessStatus: () => status.value }
}))
vi.mock('../settings', () => ({ getStored: () => ({}) }))
const { captureWholeScreen, encodeImage, fitTo, withWindowsHidden } = await import('../capture')

const display = { id: 7, scaleFactor: 2, size: { width: 1728, height: 1117 } } as Electron.Display

function picture(width: number, height: number) {
  const img: Record<string, unknown> = {
    getSize: () => ({ width, height }),
    isEmpty: () => false,
    toJPEG: () => Buffer.from('jpeg'),
    resize: vi.fn(({ width: w, height: h }) => picture(w, h))
  }
  return img as unknown as Electron.NativeImage
}

const source = (id: string, img = picture(2048, 1324)) => ({ display_id: id, thumbnail: img })

beforeEach(() => {
  status.value = 'granted'
  getSources.mockReset()
})

describe('fitTo', () => {
  it('shrinks to fit the long side', () => {
    expect(fitTo(3456, 2234, 2048)).toEqual({ width: 2048, height: 1324 })
    expect(fitTo(2234, 3456, 2048)).toEqual({ width: 1324, height: 2048 })
  })

  it('never enlarges', () => {
    expect(fitTo(1280, 800, 2048)).toEqual({ width: 1280, height: 800 })
  })
})

describe('encodeImage', () => {
  it('keeps 1600 as the usual limit, and allows more when asked', () => {
    expect(encodeImage(picture(2048, 1324)).width).toBe(1600)
    expect(encodeImage(picture(2048, 1324), 2048).width).toBe(2048)
  })
})

describe('captureWholeScreen', () => {
  it('asks for the display at its real pixels, up to 2048', async () => {
    getSources.mockResolvedValue([source('7')])
    await captureWholeScreen(display)
    expect(getSources).toHaveBeenCalledWith({ types: ['screen'], thumbnailSize: { width: 2048, height: 1324 } })
  })

  it('takes the display under the cursor, not just the first one', async () => {
    const wanted = picture(1000, 500)
    getSources.mockResolvedValue([source('1'), source('7', wanted)])
    const { context } = await captureWholeScreen(display)
    expect(context).toMatchObject({ kind: 'image', wholeScreen: true, width: 1000, height: 500 })
  })

  it('shows the friendly notice when macOS refuses, rather than failing quietly', async () => {
    getSources.mockRejectedValue(new Error('Failed to get sources.'))
    expect(await captureWholeScreen(display)).toEqual({ context: null, notice: 'needs-screen' })
  })

  it('shows it for an empty picture too', async () => {
    const empty = { ...source('7'), thumbnail: { isEmpty: () => true } }
    getSources.mockResolvedValue([empty])
    expect(await captureWholeScreen(display)).toEqual({ context: null, notice: 'needs-screen' })
    getSources.mockResolvedValue([])
    expect(await captureWholeScreen(display)).toEqual({ context: null, notice: 'needs-screen' })
  })

  it('warns when the picture may only show the wallpaper', async () => {
    status.value = 'denied'
    getSources.mockResolvedValue([source('7')])
    const { context, notice } = await captureWholeScreen(display)
    expect(context).not.toBeNull()
    expect(notice).toBe('needs-screen')
  })
})

describe('withWindowsHidden', () => {
  const win = (destroyed = false) => ({ setOpacity: vi.fn(), isDestroyed: () => destroyed })

  it('hides the windows for the capture, then brings them back', async () => {
    const w = win()
    let during = -1
    const out = await withWindowsHidden([w], async () => {
      during = w.setOpacity.mock.calls.at(-1)?.[0]
      return 'done'
    })
    expect(out).toBe('done')
    expect(during).toBe(0)
    expect(w.setOpacity.mock.calls.at(-1)).toEqual([1])
  })

  it('brings them back even if the capture fails', async () => {
    const w = win()
    await expect(withWindowsHidden([w], () => Promise.reject(new Error('No')))).rejects.toThrow('No')
    expect(w.setOpacity.mock.calls.at(-1)).toEqual([1])
  })

  it('leaves alone a window that closed meanwhile', async () => {
    const w = win(true)
    await withWindowsHidden([w], async () => {})
    expect(w.setOpacity).toHaveBeenCalledTimes(1)
  })
})

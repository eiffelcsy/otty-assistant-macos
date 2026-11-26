import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mac = { packaged: true, inApplications: false, declined: false, answer: 0, moveFails: false, moveCancelled: false }
const moveToApplicationsFolder = vi.fn(() => {
  if (mac.moveFails) throw new Error('read-only volume')
  return !mac.moveCancelled
})
const focus = vi.fn()
const showMessageBox = vi.fn(async () => ({ response: mac.answer }))
const saveMoveDeclined = vi.fn()

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mac.packaged
    },
    isInApplicationsFolder: () => mac.inApplications,
    moveToApplicationsFolder,
    focus
  },
  dialog: { showMessageBox }
}))
vi.mock('../settings', () => ({ getConnections: () => [], saveConnections: () => {}, keychain: () => ({ available: () => false, lock: (s: string) => s, unlock: (s: string) => s }), getStored: () => ({ moveDeclined: mac.declined }), saveMoveDeclined }))

const { offerMove } = await import('../install')
const platform = process.platform

afterAll(() => Object.defineProperty(process, 'platform', { value: platform }))

beforeEach(() => {
  Object.assign(mac, { packaged: true, inApplications: false, declined: false, answer: 0, moveFails: false, moveCancelled: false })
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  Object.defineProperty(process, 'platform', { value: 'darwin' })
})

describe('moving into Applications (D-53)', () => {
  it('asks in the installed app outside Applications, and moves on yes', async () => {
    await offerMove()
    expect(focus).toHaveBeenCalledWith({ steal: true }) // no Dock icon, so it comes to the front to ask
    expect(showMessageBox).toHaveBeenCalledOnce()
    expect(moveToApplicationsFolder).toHaveBeenCalledOnce()
    expect(saveMoveDeclined).not.toHaveBeenCalled()
  })

  it('takes a cancel in macOS’s own replace prompt as a no', async () => {
    mac.moveCancelled = true
    await offerMove()
    expect(saveMoveDeclined).toHaveBeenCalledOnce()
  })

  it('keeps a no, and asks no more', async () => {
    mac.answer = 1
    await offerMove()
    expect(moveToApplicationsFolder).not.toHaveBeenCalled()
    expect(saveMoveDeclined).toHaveBeenCalledOnce()
    mac.declined = true
    await offerMove()
    expect(showMessageBox).toHaveBeenCalledOnce()
  })

  it('never asks in development, or from Applications', async () => {
    mac.packaged = false
    await offerMove()
    mac.packaged = true
    mac.inApplications = true
    await offerMove()
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('says so kindly when the move fails, and carries on', async () => {
    mac.moveFails = true
    await expect(offerMove()).resolves.toBeUndefined()
    expect(showMessageBox).toHaveBeenCalledTimes(2)
    expect(showMessageBox.mock.calls[1]).toMatchObject([{ message: 'Otty couldn’t move itself' }])
  })
})

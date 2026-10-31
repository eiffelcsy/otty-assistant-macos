import { clipboard, ClipboardItem, nativeImage, systemPreferences } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { PanelOpenPayload } from '../shared/types'

const run = promisify(execFile)
const isMac = process.platform === 'darwin'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const MAX_TEXT = 12_000
const MAX_IMAGE_SIDE = 1600

/** Eagerly copies every format on the clipboard so it survives being overwritten. */
async function snapshot(): Promise<ClipboardItem[]> {
  const items = await clipboard.read().catch(() => [])
  const copies: ClipboardItem[] = []
  for (const item of items) {
    const record: Record<string, Blob> = {}
    for (const type of item.types) {
      try {
        const data = await item.getType(type)
        if (data instanceof Blob) record[type] = data
      } catch {
        /* format vanished or unreadable; skip it */
      }
    }
    if (Object.keys(record).length) copies.push(new ClipboardItem(record))
  }
  return copies
}

async function restore(items: ClipboardItem[]): Promise<void> {
  clipboard.clear()
  if (items.length) await clipboard.write(items).catch(() => {})
}

/**
 * Reads the user's current selection in the frontmost app by simulating ⌘C,
 * then puts their clipboard back exactly as it was.
 * `delayMs` lets the user release hotkey modifiers first (⌥ held + ⌘C = ⌘⌥C).
 */
export async function captureSelection(delayMs = 0): Promise<PanelOpenPayload> {
  if (!isMac) {
    // Dev convenience on other platforms: use whatever is on the clipboard.
    const text = (await clipboard.readText()).trim()
    return { context: text ? { kind: 'text', text: text.slice(0, MAX_TEXT) } : null }
  }

  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    return { context: null, notice: 'needs-accessibility' }
  }

  if (delayMs) await sleep(delayMs)

  const before = await snapshot()
  const sentinel = `__otty_${Date.now()}_${Math.random()}`
  await clipboard.writeText(sentinel)

  try {
    await run('osascript', ['-e', 'tell application "System Events" to keystroke "c" using {command down}'])
  } catch {
    await restore(before)
    return { context: null, notice: 'needs-accessibility' }
  }

  let text = ''
  for (let i = 0; i < 12; i++) {
    await sleep(35)
    const now = await clipboard.readText()
    if (now !== sentinel) {
      text = now
      break
    }
  }
  await restore(before)

  text = text.trim()
  return { context: text ? { kind: 'text', text: text.slice(0, MAX_TEXT) } : null }
}

/** Native crosshair snip (`screencapture -i`). Resolves with null context if the user presses Esc. */
export async function captureScreenshot(): Promise<PanelOpenPayload> {
  if (!isMac) return { context: null, notice: 'snip-mac-only' }

  const path = join(tmpdir(), `otty-snip-${Date.now()}.png`)
  try {
    await run('screencapture', ['-i', '-x', '-t', 'png', path])
  } catch {
    // Non-zero exit = cancelled.
  }
  if (!existsSync(path)) return { context: null }

  try {
    let img = nativeImage.createFromPath(path)
    if (img.isEmpty()) return { context: null }
    const { width, height } = img.getSize()
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height))
    if (scale < 1) {
      img = img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' })
    }
    const size = img.getSize()
    const dataUrl = `data:image/jpeg;base64,${img.toJPEG(85).toString('base64')}`
    const notice = systemPreferences.getMediaAccessStatus('screen') === 'granted' ? undefined : 'needs-screen'
    return { context: { kind: 'image', dataUrl, width: size.width, height: size.height }, notice }
  } finally {
    try {
      unlinkSync(path)
    } catch {
      /* already gone */
    }
  }
}

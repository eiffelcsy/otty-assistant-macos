import { clipboard, ClipboardItem, nativeImage, systemPreferences, type NativeImage } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AppInfo, PanelOpenPayload } from '../shared/types'
import { getStored } from './settings'
import { cleanUrl } from './web'

const run = promisify(execFile)
const isMac = process.platform === 'darwin'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const MAX_TEXT = 12_000
const MAX_IMAGE_SIDE = 1600

/** Downscales a picture to at most 1600px on its long side and encodes it as a JPEG data URL (FR-4.2). */
export function encodeImage(img: NativeImage): { dataUrl: string; width: number; height: number } {
  const { width, height } = img.getSize()
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height))
  if (scale < 1) {
    img = img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' })
  }
  const size = img.getSize()
  return { dataUrl: `data:image/jpeg;base64,${img.toJPEG(85).toString('base64')}`, width: size.width, height: size.height }
}

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
    const img = nativeImage.createFromPath(path)
    if (img.isEmpty()) return { context: null }
    const notice = systemPreferences.getMediaAccessStatus('screen') === 'granted' ? undefined : 'needs-screen'
    return { context: { kind: 'image', ...encodeImage(img) }, notice }
  } finally {
    try {
      unlinkSync(path)
    } catch {
      /* already gone */
    }
  }
}

// Browsers whose current page address can be read over AppleScript. Firefox has no such dictionary.
const BROWSERS: Record<string, string> = {
  'com.apple.Safari': 'URL of front document',
  'com.google.Chrome': 'URL of active tab of front window',
  'com.brave.Browser': 'URL of active tab of front window',
  'com.microsoft.edgemac': 'URL of active tab of front window',
  'com.vivaldi.Vivaldi': 'URL of active tab of front window',
  'com.operasoftware.Opera': 'URL of active tab of front window',
  'company.thebrowser.Browser': 'URL of active tab of front window'
}

const FRONTMOST_SCRIPT = [
  'tell application "System Events"',
  'set p to first application process whose frontmost is true',
  'set b to ""',
  'try',
  'set b to bundle identifier of p',
  'end try',
  'set t to ""',
  'try',
  'set t to name of front window of p',
  'end try',
  'return (unix id of p as text) & linefeed & name of p & linefeed & b & linefeed & t',
  'end tell'
]

async function browserUrl(bundle: string): Promise<ReturnType<typeof cleanUrl>> {
  const expr = BROWSERS[bundle]
  if (!expr) return undefined
  try {
    // The bundle id comes from the fixed list above, never from the system.
    const { stdout } = await run('osascript', ['-e', `tell application id "${bundle}" to return ${expr}`], { timeout: 600 })
    return cleanUrl(stdout.trim())
  } catch {
    return undefined // Automation not allowed yet, no window open, or too slow
  }
}

/**
 * The app the user is working in (name, window title and, for browsers, the page address),
 * so Otty can tailor its help. Null when it's Otty itself, when sharing is off, or off macOS.
 */
export async function frontmostApp(): Promise<AppInfo | null> {
  if (!isMac || !getStored().shareAppContext) return null
  try {
    const { stdout } = await run('osascript', FRONTMOST_SCRIPT.flatMap((l) => ['-e', l]), { timeout: 800 })
    const [pid, name, bundle, title] = stdout.replace(/\n$/, '').split('\n')
    if (!name || Number(pid) === process.pid) return null
    const info: AppInfo = { name }
    if (title && title !== name) info.title = title.slice(0, 200)
    const page = await browserUrl(bundle)
    if (page) {
      info.url = page.url
      if (page.trimmed) info.trimmed = true
    }
    return info
  } catch {
    return null
  }
}

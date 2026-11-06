import { clipboard, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { StepAction, StepApp } from '../../shared/types'
import { snapshotClipboard, restoreClipboard } from '../capture'
import { parseCombo } from './keys'
import { openTarget } from './open'

export { isRisky } from './risk'

// The hands of a step card. Everything here runs because the user pressed a button, and only in the app they asked from.
// Anything from the model goes through argv, never into the text of a script.

const run = promisify(execFile)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** How long the target app gets to read the clipboard before it's put back. */
const PASTE_MS = 350

export interface ActResult {
  ok: boolean
  /** Shown on the step. */
  message?: string
  /** The button can't work here, so this becomes a step to do by hand. */
  manual?: boolean
}

const script = (lines: string[], args: string[]) => run('osascript', [...lines.flatMap((l) => ['-e', l]), '--', ...args], { timeout: 5000 })

const ACTIVATE = (app: StepApp) => (app.bundleId ? 'tell application id (item 1 of argv) to activate' : 'tell application (item 1 of argv) to activate')
const who = (app: StepApp) => app.bundleId ?? app.name

/** True when the app's focused field hides what's typed. Unknown counts as no: macOS blocks pasting there anyway. */
async function inPasswordField(app: StepApp): Promise<boolean> {
  try {
    const { stdout } = await script(
      [
        'on run argv',
        'tell application "System Events" to tell process (item 1 of argv)',
        'return value of attribute "AXSubrole" of (value of attribute "AXFocusedUIElement")',
        'end tell',
        'end run'
      ],
      [app.name]
    )
    return stdout.includes('AXSecureTextField')
  } catch {
    return false
  }
}

/** ⌘V and nothing more: Return is never sent, so a Terminal command is pasted, not run. */
async function paste(text: string, mode: 'replace' | 'insert', app: StepApp): Promise<ActResult> {
  const before = await snapshotClipboard()
  try {
    await script(['on run argv', ACTIVATE(app), 'delay 0.2', 'end run'], [who(app)])
    if (await inPasswordField(app)) return { ok: false, message: 'That’s a password field, so Otty won’t paste there. Copy it instead.' }
    await clipboard.writeText(text)
    await run('osascript', [
      '-e',
      'tell application "System Events"',
      // Collapse any selection first, so "insert" doesn't replace it.
      ...(mode === 'insert' ? ['-e', 'key code 124'] : []),
      '-e',
      'keystroke "v" using {command down}',
      '-e',
      'end tell'
    ])
    await sleep(PASTE_MS)
    return { ok: true }
  } catch {
    return { ok: false, message: 'Otty couldn’t reach that app. Is it still open?' }
  } finally {
    await restoreClipboard(before)
  }
}

const MENU_SCRIPT = [
  'on run argv',
  'tell application "System Events" to tell process (item 1 of argv)',
  'set frontmost to true',
  'set current to menu 1 of menu bar item (item 2 of argv) of menu bar 1',
  'repeat with i from 3 to (count of argv) - 1',
  'set current to menu 1 of menu item (item i of argv) of current',
  'end repeat',
  'click menu item (item -1 of argv) of current',
  'end tell',
  'end run'
]

/** "PDF…" and "PDF..." are the same to a person, not to System Events. */
const otherDots = (s: string) => (s.endsWith('…') ? `${s.slice(0, -1)}...` : s.endsWith('...') ? `${s.slice(0, -3)}…` : s)

async function clickMenu(path: string[], app: StepApp): Promise<ActResult> {
  for (const attempt of [path, [...path.slice(0, -1), otherDots(path.at(-1)!)]]) {
    try {
      await script(MENU_SCRIPT, [app.name, ...attempt])
      return { ok: true }
    } catch {
      /* try the other spelling */
    }
  }
  return { ok: false, manual: true, message: 'Otty couldn’t find that menu.' }
}

async function press(combo: string, app: StepApp): Promise<ActResult> {
  const shortcut = parseCombo(combo)
  if (!shortcut) return { ok: false, manual: true, message: 'Otty can’t press that one for you.' }
  // The modifiers come from a fixed list in keys.ts.
  const using = `using {${shortcut.modifiers.join(', ')}}`
  const key = typeof shortcut.key === 'number' ? `key code ${shortcut.key} ${using}` : `keystroke (item 2 of argv) ${using}`
  try {
    await script(['on run argv', ACTIVATE(app), 'delay 0.2', `tell application "System Events" to ${key}`, 'end run'], [who(app), String(shortcut.key)])
    return { ok: true }
  } catch {
    return { ok: false, message: 'Otty couldn’t reach that app. Is it still open?' }
  }
}

async function open(raw: string): Promise<ActResult> {
  const target = openTarget(raw)
  if (!target) return { ok: false, manual: true, message: 'Otty can’t open that.' }
  if (target.kind === 'reveal') {
    shell.showItemInFolder(target.path)
    return { ok: true }
  }
  if (target.kind === 'app') {
    const failed = await shell.openPath(target.path)
    return failed ? { ok: false, message: 'Otty couldn’t open that app.' } : { ok: true }
  }
  await shell.openExternal(target.url)
  return { ok: true }
}

/** Does one step. `app` is where it acts, and never Otty itself. */
export async function act(action: StepAction, app: StepApp | null): Promise<ActResult> {
  if (action.kind === 'copy') {
    await clipboard.writeText(action.text)
    return { ok: true }
  }
  if (process.platform !== 'darwin') return { ok: false, manual: true, message: 'This only works on a Mac.' }
  if (action.kind === 'open') return open(action.target)
  if (!app) {
    if (action.kind !== 'paste') return { ok: false, manual: true, message: 'Otty doesn’t know which app you’re in, so this one’s for you.' }
    await clipboard.writeText(action.text)
    return { ok: true, message: 'Copied. Paste it where you need it.' }
  }
  if (action.kind === 'paste') return paste(action.text, action.mode ?? 'replace', app)
  if (action.kind === 'menu') return clickMenu(action.path, app)
  return press(action.combo, app)
}

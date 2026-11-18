import { clipboard, ClipboardItem, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { copyFormats } from './copyFormats'
import type { MacHands } from './tools'

// What the tools that change the Mac do there (D-45 step 3). `ChatSession` hands these to its tools through
// `SessionDeps`, so the tool loop never imports electron, and a job, which isn't given them, can't change the Mac.

const run = promisify(execFile)

/** Copies text, with a table as HTML as well so it pastes as a table. True when it held one. */
export async function copyText(source: string): Promise<boolean> {
  const { text, html } = copyFormats(source)
  if (html) await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })])
  else await clipboard.writeText(text)
  return Boolean(html)
}

async function createReminder(title: string, due: Date | null): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Reminders are only available on macOS.')
  // Values go through argv, never string-interpolated into the script.
  const script = [
    'on run argv',
    'set t to item 1 of argv',
    'tell application "Reminders"',
    'if (count of argv) > 1 then',
    'set d to current date',
    'set day of d to 1',
    'set year of d to (item 2 of argv as integer)',
    'set month of d to (item 3 of argv as integer)',
    'set day of d to (item 4 of argv as integer)',
    'set hours of d to (item 5 of argv as integer)',
    'set minutes of d to (item 6 of argv as integer)',
    'set seconds of d to 0',
    'make new reminder with properties {name:t, remind me date:d}',
    'else',
    'make new reminder with properties {name:t}',
    'end if',
    'end tell',
    'end run'
  ]
  const argv = due
    ? [title, due.getFullYear(), due.getMonth() + 1, due.getDate(), due.getHours(), due.getMinutes()].map(String)
    : [title]
  await run('osascript', [...script.flatMap((l) => ['-e', l]), '--', ...argv])
}

export const macHands: MacHands = {
  open: (url) => shell.openExternal(url),
  copy: copyText,
  remind: createReminder
}

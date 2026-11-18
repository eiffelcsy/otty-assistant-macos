import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { format } from 'util'
import { maskSecrets } from '../shared/secrets'

// D-50: a log a tester can send, with nothing of theirs in it. Main's warnings and errors are teed here as they're
// written, so no call site changes. Each line is masked for keys, has the home folder's path (and so the user's
// name) and any web address taken out, and is cut short, because an error can quote what a service sent back.
// Chats, highlights, files and answers are never logged.

const MAX_BYTES = 1_000_000
const LINE_CHARS = 300

let file: string | null = null

/** One line: the time, the level and the message. Masked before it's cut, so half a key can't survive. */
export function logLine(level: 'info' | 'warn' | 'error', args: unknown[], now = new Date()): string {
  const masked = maskSecrets(format(...args))
    .text.split(homedir())
    .join('~')
    .replace(/\b[a-z][\w+.-]*:\/\/\S+/gi, '<address>')
  return `${now.toISOString()} ${level} ${masked.replace(/\s+/g, ' ').trim().slice(0, LINE_CHARS)}\n`
}

function write(level: 'info' | 'warn' | 'error', args: unknown[]): void {
  if (!file) return
  try {
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) renameSync(file, `${file.slice(0, -4)}.1.log`)
    appendFileSync(file, logLine(level, args))
  } catch {
    /* a log must never break Otty */
  }
}

/** Starts `otty.log` in `dir` (the Mac's ~/Library/Logs/Otty), keeping one older file once it passes 1 MB. */
export function startLog(dir: string, version: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    return
  }
  file = join(dir, 'otty.log')
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      write(level, args)
    }
  }
  write('info', [`Otty ${version} started`])
}

/** The log's last lines, for Copy diagnostics. */
export function lastLines(n: number): string[] {
  try {
    return file ? readFileSync(file, 'utf8').trimEnd().split('\n').slice(-n) : []
  } catch {
    return []
  }
}

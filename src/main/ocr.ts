import { app } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import type { OcrLine } from '../shared/types'

/** The first read after installing took close to a minute in testing, while Apple's text models load. */
const TIMEOUT_MS = 90_000

function helperPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'otty-ocr') : join(app.getAppPath(), 'build/bin/otty-ocr')
}

/** The helper's output as lines. Null when it isn't what the helper should print. */
export function parseLines(output: string): OcrLine[] | null {
  try {
    const { lines } = JSON.parse(output)
    if (!Array.isArray(lines)) return null
    return lines.filter((l) => typeof l?.text === 'string' && l.text.trim() && [l.box?.x, l.box?.y, l.box?.w, l.box?.h].every(Number.isFinite))
  } catch {
    return null
  }
}

/** Reads the words in a picture, on the Mac. The picture goes over stdin, so it never touches disk. Null if that failed. */
export function readText(picture: Buffer): Promise<OcrLine[] | null> {
  if (process.platform !== 'darwin') return Promise.resolve(null)
  return new Promise((resolve) => {
    const helper = spawn(helperPath(), [], { stdio: ['pipe', 'pipe', 'ignore'], timeout: TIMEOUT_MS })
    const chunks: Buffer[] = []
    helper.stdout.on('data', (c: Buffer) => chunks.push(c))
    helper.on('error', (err) => {
      console.error('Could not start otty-ocr', err)
      resolve(null)
    })
    helper.on('close', (code) => resolve(code === 0 ? parseLines(Buffer.concat(chunks).toString('utf8')) : null))
    helper.stdin.on('error', () => {}) // it quit early; 'close' reports that
    helper.stdin.end(picture)
  })
}

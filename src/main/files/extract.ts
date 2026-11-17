import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { extname } from 'path'
import { promisify } from 'util'
import type { FileKind } from '../../shared/types'
import { FileError } from './errors'
import { codeLanguage } from './languages'
import { readNotebook, type NotebookCell } from './notebook'
import { maskSecrets } from '../../shared/secrets'
import { unzippedSize } from './zip'

export { FileError }

// Turns a document into plain text. Runs inside the file-reader utility process (see worker.ts),
// so a big PDF never freezes the app. Pictures are read in main instead (image.ts), because
// nativeImage isn't available here. No Electron imports: this runs in tests too.

/** `hidden` counts what `maskSecrets` replaced, for the chip ("Otty hid 2 things…"). */
/** `hiddenLines` are their lines, with each value cut to a hint (D-40): main keeps them in memory, never sends them. */
type Hidden = { hidden?: number; hiddenLines?: string[] }
export type Extracted =
  | { kind: 'pdf'; pages: string[] }
  | { kind: 'docx' | 'doc'; text: string }
  | ({ kind: 'text'; text: string } & Hidden)
  | ({ kind: 'code'; lang: string; text: string } & Hidden)
  | ({ kind: 'notebook'; lang: string; cells: NotebookCell[] } & Hidden)

/** Plain text: no line numbers. Code is matched by `codeLanguage` first. */
const TEXT_EXT = new Set('txt text md markdown csv tsv log srt vtt'.split(' '))
/** Read by macOS `textutil`, which turns them into plain text. */
const DOC_EXT = new Set(['doc', 'rtf', 'odt', 'wordml'])
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp'])

/** What kind of file this is, from its name, or null when Otty can't read it. */
export function kindOf(name: string): FileKind | null {
  const ext = extname(name).slice(1).toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'ipynb') return 'notebook'
  if (DOC_EXT.has(ext)) return 'doc'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (TEXT_EXT.has(ext)) return 'text'
  if (codeLanguage(name)) return 'code'
  return null
}

/** The extensions the file picker's first filter shows. */
export const PICKER_EXTENSIONS = ['pdf', 'docx', 'ipynb', ...DOC_EXT, ...IMAGE_EXT, ...TEXT_EXT]

/** A .docx is a zip; refuse one that would unpack to something enormous. */
const MAX_UNZIPPED = 200 * 1024 * 1024
/** Below this many characters per page on average, a PDF is treated as a scan. */
const SCAN_CHARS_PER_PAGE = 20

export async function extract(path: string, kind: Exclude<FileKind, 'image'>, name = path): Promise<Extracted> {
  if (kind === 'doc') return { kind, text: await textutil(path) }
  const buf = await readFile(path)
  if (kind === 'pdf') return { kind, pages: await pdfPages(buf) }
  if (kind === 'docx') return { kind, text: await docxText(buf) }
  if (kind === 'notebook') {
    const nb = readNotebook(decodeText(buf))
    let hidden = 0
    const hiddenLines: string[] = []
    const cells = nb.cells.map((c) => {
      const m = maskSecrets(c.text, { lines: true })
      hidden += m.hidden
      hiddenLines.push(...(m.lines ?? []))
      return { ...c, text: m.text }
    })
    return { kind, lang: nb.lang, cells, ...(hidden ? { hidden, hiddenLines } : {}) }
  }
  const { text, hidden, lines } = maskSecrets(decodeText(buf), { lines: true })
  const extra = hidden ? { hidden, hiddenLines: lines } : {}
  if (kind === 'code') return { kind, lang: codeLanguage(name) ?? 'Code', text, ...extra }
  return { kind: 'text', text, ...extra }
}

const run = promisify(execFile)

/** `.doc`, `.rtf` and `.odt` through macOS's own converter, which never touches the network. */
async function textutil(path: string): Promise<string> {
  if (process.platform !== 'darwin') throw new FileError('Otty can only read this kind of document on a Mac.')
  let out: string
  try {
    ;({ stdout: out } = await run('/usr/bin/textutil', ['-convert', 'txt', '-stdout', '-encoding', 'UTF-8', path], { maxBuffer: 64 * 1024 * 1024 }))
  } catch {
    throw new FileError('Otty couldn’t open this document. It may be damaged.')
  }
  const text = out.replace(/\n{3,}/g, '\n\n').trim()
  if (!text) throw new FileError('This document looks empty.')
  return text
}

async function pdfPages(buf: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // A utility process doesn't look like plain Node to pdfjs, so it would try a Web Worker.
  // Loading the worker module here makes it parse on this thread instead.
  ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 })
  let doc
  try {
    doc = await task.promise
  } catch (err) {
    if ((err as Error).name === 'PasswordException') throw new FileError('This PDF is locked with a password, so Otty can’t open it.')
    throw new FileError('Otty couldn’t open this PDF. It may be damaged.')
  }
  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str + (item.hasEOL ? '\n' : '')
      }
      pages.push(text.replace(/[ \t]+\n/g, '\n').trim())
      page.cleanup()
    }
    const chars = pages.reduce((n, p) => n + p.length, 0)
    if (chars < SCAN_CHARS_PER_PAGE * pages.length) {
      throw new FileError('This PDF looks like a scan (pictures of pages), and Otty can’t read scanned pages yet.')
    }
    return pages
  } finally {
    await task.destroy()
  }
}

async function docxText(buf: Buffer): Promise<string> {
  let size: number
  try {
    size = unzippedSize(buf)
  } catch {
    throw new FileError('Otty couldn’t open this Word document. It may be damaged.')
  }
  if (size > MAX_UNZIPPED) throw new FileError('This Word document is too big for Otty to read.')
  const mammoth = (await import('mammoth')).default
  try {
    const { value } = await mammoth.extractRawText({ buffer: buf })
    const text = value.replace(/\n{3,}/g, '\n\n').trim()
    if (!text) throw new FileError('This Word document looks empty.')
    return text
  } catch (err) {
    if (err instanceof FileError) throw err
    throw new FileError('Otty couldn’t open this Word document. It may be damaged.')
  }
}

/** UTF-8 (with or without a BOM). A file with NUL bytes near the start isn't text. */
export function decodeText(buf: Buffer): string {
  if (buf.subarray(0, 8000).includes(0)) throw new FileError('This doesn’t look like a text file, so Otty can’t read it.')
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '').trim()
  if (!text) throw new FileError('This file looks empty.')
  return text
}

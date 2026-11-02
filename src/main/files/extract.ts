import { readFile } from 'fs/promises'
import { extname } from 'path'
import type { FileKind } from '../../shared/types'
import { unzippedSize } from './zip'

// Turns a document into plain text. Runs inside the file-reader utility process (see worker.ts),
// so a big PDF never freezes the app. Pictures are read in main instead (image.ts), because
// nativeImage isn't available here. No Electron imports: this runs in tests too.

/** A problem worth telling the user about, already in friendly words. */
export class FileError extends Error {}

export type Extracted = { kind: 'pdf'; pages: string[] } | { kind: 'docx' | 'text'; text: string }

const TEXT_EXT = new Set(
  (
    'txt text md markdown csv tsv json log xml yaml yml html htm css js mjs ts tsx jsx py rb go rs java kt c h cpp hpp cs ' +
    'swift sh zsh sql ini toml cfg conf env rtf srt vtt tex'
  ).split(' ')
)
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp'])

/** What kind of file this is, from its name, or null when Otty can't read it. */
export function kindOf(name: string): FileKind | null {
  const ext = extname(name).slice(1).toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (TEXT_EXT.has(ext)) return 'text'
  return null
}

/** A .docx is a zip; refuse one that would unpack to something enormous. */
const MAX_UNZIPPED = 200 * 1024 * 1024
/** Below this many characters per page on average, a PDF is treated as a scan. */
const SCAN_CHARS_PER_PAGE = 20

export async function extract(path: string, kind: Exclude<FileKind, 'image'>): Promise<Extracted> {
  const buf = await readFile(path)
  if (kind === 'pdf') return { kind, pages: await pdfPages(buf) }
  if (kind === 'docx') return { kind, text: await docxText(buf) }
  return { kind, text: decodeText(buf) }
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

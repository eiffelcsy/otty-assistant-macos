import { BrowserWindow, dialog, nativeImage, utilityProcess, type NativeImage, type UtilityProcess } from 'electron'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { stat, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, isAbsolute, join } from 'path'
import { promisify } from 'util'
import type { AttachResult, FileAttachment, PendingFile } from '../../shared/types'
import { encodeImage } from '../capture'
import { kindOf, type Extracted } from './extract'
import type { ReadReply, ReadRequest } from './worker'

// Files the user attached: picked, dropped or pasted. Main keeps the path and what's inside;
// the renderer only gets an id, the name and (for pictures) a thumbnail. Originals are never copied.

const MAX_BYTES = 25 * 1024 * 1024
const READ_TIMEOUT = 60_000
/** Files read but never sent (the panel was closed, say) are dropped oldest first past this. */
const MAX_KEPT = 20

const run = promisify(execFile)

interface Entry {
  path: string
  name: string
  meta?: FileAttachment
  doc?: Extracted
  image?: { dataUrl: string; width: number; height: number }
}

const entries = new Map<string, Entry>()

export interface Prepared {
  meta: FileAttachment
  doc?: Extracted
  image?: { dataUrl: string; width: number; height: number }
}

function remember(path: string): PendingFile {
  const id = randomUUID()
  const name = basename(path)
  entries.set(id, { path, name })
  while (entries.size > MAX_KEPT) entries.delete(entries.keys().next().value!)
  return { id, name }
}

/** Paths from a drop or paste (via the preload's `webUtils.getPathForFile`). */
export function registerFiles(paths: unknown): PendingFile[] {
  if (!Array.isArray(paths)) return []
  return paths.filter((p): p is string => typeof p === 'string' && isAbsolute(p)).map(remember)
}

export async function pickFiles(win: BrowserWindow | null): Promise<PendingFile[]> {
  const options: Electron.OpenDialogOptions = {
    title: 'Attach files',
    buttonLabel: 'Attach',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Documents, pictures and text',
        extensions: ['pdf', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'txt', 'md', 'csv', 'json']
      },
      { name: 'All files', extensions: ['*'] }
    ]
  }
  const { canceled, filePaths } = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options))
  return canceled ? [] : filePaths.map(remember)
}

export function discardFile(id: string): void {
  entries.delete(id)
}

/** Hands over the files for one message and forgets them: from now on they live in the chat's history. */
export function takeFiles(ids: unknown): Prepared[] {
  if (!Array.isArray(ids)) return []
  const out: Prepared[] = []
  for (const id of ids.slice(0, 5)) {
    const e = typeof id === 'string' ? entries.get(id) : undefined
    if (!e?.meta) continue
    out.push({ meta: e.meta, doc: e.doc, image: e.image })
    entries.delete(id)
  }
  return out
}

const fail = (message: string): AttachResult => ({ ok: false, message })

export async function readFile(id: string): Promise<AttachResult> {
  const e = entries.get(id)
  if (!e) return fail('Otty lost track of this file. Please add it again.')
  if (e.meta) return { ok: true, file: e.meta }

  const kind = kindOf(e.name)
  if (!kind) return fail('Otty can’t read this kind of file yet. Try a PDF, a Word document, a picture or a text file.')
  let size: number
  try {
    const s = await stat(e.path)
    if (!s.isFile()) return fail('That’s a folder. Please pick the files inside it instead.')
    size = s.size
  } catch {
    return fail('Otty couldn’t find this file. It may have been moved.')
  }
  if (size > MAX_BYTES) return fail('That file is too big for Otty. Try one under 25 MB.')
  if (size === 0) return fail('This file looks empty.')

  if (kind === 'image') {
    const img = await loadImage(e.path)
    if (!img) return fail('Otty couldn’t open this picture.')
    e.image = encodeImage(img)
    const thumb = img.resize({ height: 72, quality: 'good' })
    e.meta = { id, name: e.name, kind, thumb: `data:image/jpeg;base64,${thumb.toJPEG(70).toString('base64')}` }
    return { ok: true, file: e.meta }
  }

  const reply = await readInWorker(e.path, kind)
  if (!reply.ok) return fail(reply.message ?? 'Otty couldn’t read this file. It may be damaged.')
  if (!entries.has(id)) return fail('Removed.') // ✕ was pressed while it was being read
  e.doc = reply.result
  e.meta = { id, name: e.name, kind, pages: reply.result.kind === 'pdf' ? reply.result.pages.length : undefined }
  return { ok: true, file: e.meta }
}

/** PNG and JPEG load directly; HEIC, WebP, GIF and TIFF go through macOS `sips` first. */
async function loadImage(path: string): Promise<NativeImage | null> {
  const img = nativeImage.createFromPath(path)
  if (!img.isEmpty()) return img
  if (process.platform !== 'darwin') return null
  const out = join(tmpdir(), `otty-file-${randomUUID()}.jpg`)
  try {
    await run('sips', ['-s', 'format', 'jpeg', path, '--out', out])
    const converted = nativeImage.createFromPath(out)
    return converted.isEmpty() ? null : converted
  } catch {
    return null
  } finally {
    unlink(out).catch(() => {})
  }
}

// --- The file-reader utility process, started on first use.

let worker: UtilityProcess | null = null
const waiting = new Map<number, (r: ReadReply) => void>()
let nextReq = 1

function reader(): UtilityProcess {
  if (worker) return worker
  const w = utilityProcess.fork(join(__dirname, 'fileWorker.js'), [], { serviceName: 'Otty file reader' })
  w.on('message', (r: ReadReply) => {
    waiting.get(r.reqId)?.(r)
    waiting.delete(r.reqId)
  })
  w.on('exit', () => {
    if (worker === w) worker = null
    for (const [reqId, done] of waiting) done({ reqId, ok: false })
    waiting.clear()
  })
  return (worker = w)
}

function readInWorker(path: string, kind: ReadRequest['kind']): Promise<ReadReply> {
  return new Promise((resolve) => {
    const reqId = nextReq++
    const timer = setTimeout(() => {
      waiting.delete(reqId)
      worker?.kill() // a stuck read; the next file starts a fresh reader
      resolve({ reqId, ok: false, message: 'This file is taking too long to read. Try a smaller one.' })
    }, READ_TIMEOUT)
    waiting.set(reqId, (r) => {
      clearTimeout(timer)
      resolve(r)
    })
    reader().postMessage({ reqId, path, kind } satisfies ReadRequest)
  })
}

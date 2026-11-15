import { app, BrowserWindow, clipboard, ClipboardItem, dialog, screen, session } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { DrawingExport, DrawingResult, DrawingView } from '../shared/types'
import { SLIDE_H, SLIDE_W } from '../shared/slides'

// Drawings leave the chat in three ways: a bigger view, Copy as picture, and Save as PNG or PDF (D-30).
// Pictures and PDFs are made here, in a hidden window that can't run scripts or reach the network, so the same
// drawing always comes out the same, and nothing a model wrote can do anything on the way.

/** A diagram is never drawn bigger than this, in points. */
const MAX_SIDE = 4000
/** A deck's HTML, all slides with their diagrams as pictures. */
const MAX_HTML = 20 * 1024 * 1024

/** A session of its own, where every request that isn't a `data:` address is cancelled. */
function exportSession(): Electron.Session {
  const s = session.fromPartition('otty-export')
  if (!(s as { ottyLocked?: boolean }).ottyLocked) {
    s.webRequest.onBeforeRequest((details, done) => done({ cancel: !details.url.startsWith('data:') }))
    s.setPermissionRequestHandler((_wc, _p, done) => done(false))
    ;(s as { ottyLocked?: boolean }).ottyLocked = true
  }
  return s
}

const PAGE_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`

/** One picture, at its own size, on the given background. */
function pictureHtml(d: Extract<DrawingExport, { kind: 'picture' }>, w: number, h: number): string {
  return `<!doctype html><html><head><meta charset="utf-8">${PAGE_CSP}<style>@page{size:${w}px ${h}px;margin:0}*{margin:0;padding:0}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${cssColor(d.background)};-webkit-print-color-adjust:exact}img{display:block;width:${w}px;height:${h}px}</style></head><body><img src="${d.svg.replace(/"/g, '&quot;')}"></body></html>`
}

/** Only a plain colour from the renderer's tokens, never anything that could carry a url(). */
function cssColor(c: string): string {
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(c.trim()) ? c.trim() : '#ffffff'
}

function size(d: Extract<DrawingExport, { kind: 'picture' }>): { w: number; h: number } {
  const scale = Math.min(1, MAX_SIDE / Math.max(d.width, d.height, 1))
  return { w: Math.max(1, Math.round(d.width * scale)), h: Math.max(1, Math.round(d.height * scale)) }
}

/** Checks what the renderer sent: a drawing is SVG as a data address, or a deck's HTML. Anything else is refused. */
export function validExport(d: unknown): DrawingExport | null {
  if (!d || typeof d !== 'object') return null
  const x = d as Record<string, unknown>
  const name = typeof x.name === 'string' ? x.name.replace(/[/\\:]/g, ' ').slice(0, 80).trim() || 'Otty drawing' : 'Otty drawing'
  if (x.kind === 'picture') {
    if (typeof x.svg !== 'string' || !x.svg.startsWith('data:image/svg+xml') || x.svg.length > MAX_HTML) return null
    const width = Number(x.width)
    const height = Number(x.height)
    if (!(width > 0 && height > 0)) return null
    return { kind: 'picture', svg: x.svg, width, height, background: typeof x.background === 'string' ? x.background : '#ffffff', name }
  }
  if (x.kind === 'slides') {
    if (typeof x.html !== 'string' || x.html.length > MAX_HTML) return null
    return { kind: 'slides', html: x.html, name }
  }
  return null
}

async function render<T>(html: string, w: number, h: number, work: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const win = new BrowserWindow({
    show: false,
    width: w,
    height: h,
    useContentSize: true,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, session: exportSession(), spellcheck: false }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await work(win)
  } finally {
    win.destroy()
  }
}

/** A sharp picture: drawn at twice its size. */
async function png(d: Extract<DrawingExport, { kind: 'picture' }>): Promise<Buffer> {
  const { w, h } = size(d)
  return render(pictureHtml(d, w * 2, h * 2), w * 2, h * 2, async (win) => {
    const shot = await win.webContents.capturePage()
    return shot.resize({ width: w * 2, height: h * 2, quality: 'best' }).toPNG()
  })
}

async function pdf(d: DrawingExport): Promise<Buffer> {
  if (d.kind === 'picture') {
    const { w, h } = size(d)
    return render(pictureHtml(d, w, h), w, h, (win) => win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } }))
  }
  return render(d.html, SLIDE_W, SLIDE_H, (win) => win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } }))
}

/** Copy as picture, or Save as PNG or PDF through the Mac's own save dialog (the user's click is the confirm). */
export async function exportDrawing(raw: unknown, how: 'copy' | 'png' | 'pdf', parent: BrowserWindow | null): Promise<DrawingResult> {
  const d = validExport(raw)
  if (!d) return 'failed'
  try {
    if (how === 'copy') {
      if (d.kind !== 'picture') return 'failed'
      const bytes = await png(d)
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(bytes)], { type: 'image/png' }) })])
      return 'copied'
    }
    if (how === 'png' && d.kind !== 'picture') return 'failed'
    const ext = how === 'png' ? 'png' : 'pdf'
    const options: Electron.SaveDialogOptions = {
      title: how === 'png' ? 'Save picture' : 'Save as PDF',
      defaultPath: join(app.getPath('downloads'), `${d.name}.${ext}`),
      filters: [{ name: how === 'png' ? 'PNG picture' : 'PDF', extensions: [ext] }]
    }
    const { canceled, filePath } = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return 'cancelled'
    const bytes = how === 'png' ? await png(d as Extract<DrawingExport, { kind: 'picture' }>) : await pdf(d)
    await writeFile(filePath, bytes)
    return 'saved'
  } catch (err) {
    console.error('Drawing export failed', err)
    return 'failed'
  }
}

// --- The bigger view: one window for Show big and Present.

let viewer: BrowserWindow | null = null
let shown: DrawingView | null = null

export function validView(v: unknown): DrawingView | null {
  if (!v || typeof v !== 'object') return null
  const x = v as Record<string, unknown>
  if (x.kind === 'picture' && typeof x.dataUrl === 'string' && x.dataUrl.startsWith('data:image/svg+xml')) {
    return { kind: 'picture', dataUrl: x.dataUrl, width: Number(x.width) || 800, height: Number(x.height) || 600 }
  }
  if (x.kind === 'slides' && Array.isArray(x.pages) && x.pages.every((p) => typeof p === 'string')) {
    const notes = Array.isArray(x.notes) ? x.notes.map((n) => (Array.isArray(n) ? n.filter((s): s is string => typeof s === 'string') : [])) : []
    return { kind: 'slides', pages: x.pages as string[], notes, present: x.present === true }
  }
  return null
}

export function showDrawing(raw: unknown, load: (win: BrowserWindow) => void, webPreferences: Electron.WebPreferences): void {
  const v = validView(raw)
  if (!v) return
  shown = v
  viewer?.close()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const wa = display.workArea
  const present = v.kind === 'slides' && v.present
  const win = new BrowserWindow({
    ...(present
      ? { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height, simpleFullscreen: true }
      : { width: Math.round(wa.width * 0.8), height: Math.round(wa.height * 0.8), center: true }),
    title: v.kind === 'slides' ? 'Otty slides' : 'Otty drawing',
    backgroundColor: '#1f1c1d',
    show: false,
    webPreferences
  })
  viewer = win
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  load(win)
  win.once('ready-to-show', () => {
    if (present) win.setSimpleFullScreen(true)
    win.show()
    win.focus()
  })
  win.on('closed', () => {
    if (viewer !== win) return
    viewer = null
    shown = null
  })
}

export const viewerContent = (): DrawingView | null => shown
export const closeViewer = (): void => viewer?.close()
export const getViewer = (): BrowserWindow | null => viewer

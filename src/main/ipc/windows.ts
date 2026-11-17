import { BrowserWindow, Menu, shell } from 'electron'
import type { PanelOpenPayload, QuickState } from '../../shared/types'
import { captureScreenshot, captureSelection, frontmostApp } from '../capture'
import { askAboutSelection } from '../captureRoute'
import { menuTemplate } from '../controls'
import { closeViewer, exportDrawing, showDrawing, viewerContent } from '../draw'
import { copyText } from '../tools'
import {
  endBubbleDrag,
  expandQuickToPanel,
  getBubble,
  getPanel,
  getPickup,
  getQuick,
  load,
  pickupPicture,
  readPickup,
  resizeQuick,
  setQuickState,
  showPanelAtCursor,
  showPickup,
  startBubbleDrag,
  webPreferences
} from '../windows'
import { handle, on } from './check'

export function registerWindows(): void {
  // Invoked from the panel's buttons: hide first so the previous app regains focus.
  handle('capture:selection', async () => {
    getPanel()?.hide()
    await new Promise((r) => setTimeout(r, 250))
    const [payload, app] = await Promise.all([captureSelection(), frontmostApp()])
    payload.app = app
    showPanelAtCursor()
    return payload
  })
  handle('capture:screenshot', async () => {
    getPanel()?.hide()
    const app = frontmostApp()
    const payload = await captureScreenshot()
    payload.app = await app
    showPanelAtCursor()
    return payload
  })

  handle('panel:close', () => getPanel()?.hide())
  handle('quick:close', () => getQuick()?.hide())
  handle('quick:expand', () => {
    getPanel()?.webContents.send('panel:open', { context: null } satisfies PanelOpenPayload)
    expandQuickToPanel()
  })
  on('quick:resize', (_e, height: number) => resizeQuick(height))
  on('quick:state', (_e, state: QuickState) => setQuickState(state))

  handle('shell:open', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
  })
  handle('clipboard:write', async (_e, text: string) => void (await copyText(text)))

  handle('pickup:open', (_e, dataUrl: string) => showPickup(dataUrl))
  handle('pickup:picture', () => pickupPicture())
  handle('pickup:read', () => readPickup())
  handle('pickup:close', () => getPickup()?.close())

  handle('drawing:export', (e, d: unknown, how: 'copy' | 'png' | 'pdf') => exportDrawing(d, how, BrowserWindow.fromWebContents(e.sender)))
  handle('drawing:show', (_e, v: unknown) => showDrawing(v, (win) => load(win, 'viewer'), webPreferences))
  handle('viewer:content', () => viewerContent())
  handle('viewer:close', () => closeViewer())

  on('bubble:drag', (_e, phase: 'start' | 'end') => {
    if (phase === 'start') return startBubbleDrag()
    if (!endBubbleDrag()) void askAboutSelection('bubble') // a click, not a drag
  })
  on('bubble:menu', () => {
    const b = getBubble()
    if (b) Menu.buildFromTemplate(menuTemplate()).popup({ window: b })
  })
}

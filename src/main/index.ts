import { app, BrowserWindow, globalShortcut, powerMonitor } from 'electron'
import { getStored } from './settings'
import { closeStore } from './store'
import { startMetrics } from './metrics'
import { openChat } from './captureRoute'
import { createTray, registerHotkeys } from './controls'
import { jobs, startServices } from './core'
import { registerIpc } from './ipc'
import { setBadge } from './notify'
import { createBubble, createPanel, createQuick, getPanel } from './windows'

// The app's lifecycle. What it starts lives elsewhere (D-45): the chat and jobs in `core.ts`, the windows' messages
// in `ipc/`, where captures go in `captureRoute.ts`, the menu bar and hotkeys in `controls.ts`, and what the user is
// told in `notify.ts`.

/** The network needs a moment after waking. */
const WAKE_DELAY = 5_000

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    app.dock?.hide() // Otty lives in the bubble + menu bar, not the Dock.
    startMetrics()
    registerIpc()
    createPanel().on('show', () => setBadge(false))
    createQuick().on('show', () => setBadge(false))
    createBubble()
    registerHotkeys()
    setImmediate(startServices)
    powerMonitor.on('suspend', () => jobs.suspend())
    powerMonitor.on('resume', () => setTimeout(() => void jobs.wake(), WAKE_DELAY))

    createTray()

    if (!getStored().onboarded) getPanel()?.once('ready-to-show', openChat)
  })

  app.on('second-instance', openChat)
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    closeStore()
  })
  // Keep running with no windows focused; Otty quits only from its menu.
  app.on('window-all-closed', () => {
    if (BrowserWindow.getAllWindows().length === 0) app.quit()
  })
}

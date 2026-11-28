import { app, autoUpdater, dialog, Notification } from 'electron'
import { refused } from './net'

// D-87: updates come from the newest published GitHub release, through Squirrel.Mac (Electron's autoUpdater). It
// downloads by itself and installs when Otty next quits, or now from "Restart to update Otty". Squirrel installs only a
// build signed by the same certificate as the one running (release.yml), so a swapped zip can't install. With `web`
// off nothing leaves the Mac (D-52), so there are no checks then.

const FEED = `https://github.com/eiffelcsy/otty-assistant-macos/releases/latest/download/update-${process.arch}.json`
const FIRST = 60_000
const EVERY = 6 * 60 * 60_000

type Item = Electron.MenuItemConstructorOptions

let state: 'off' | 'idle' | 'checking' | 'ready' = 'off'
let byHand = false
let changed = (): void => {}

const set = (next: typeof state): void => {
  state = next
  changed()
}

function tell(message: string, detail: string): void {
  app.focus({ steal: true }) // Otty has no Dock icon, so the box would open behind the app in front
  void dialog.showMessageBox({ type: 'info', message, detail })
}

/** Only an installed Mac app can update itself. `onChange` rebuilds the menus that show `updateItems`. */
export function startUpdates(onChange: () => void): void {
  if (process.platform !== 'darwin' || !app.isPackaged) return
  changed = onChange
  autoUpdater.setFeedURL({ url: FEED, serverType: 'json' })
  autoUpdater.on('checking-for-update', () => set('checking'))
  autoUpdater.on('update-not-available', () => {
    set('idle')
    if (byHand) tell('You have the newest Otty', `This is Otty ${app.getVersion()}.`)
  })
  autoUpdater.on('update-downloaded', (_e, _notes, name) => {
    set('ready')
    if (Notification.isSupported()) new Notification({ title: 'A new Otty is ready', body: `Otty ${name} installs the next time Otty quits, or restart it now from the menu bar.` }).show()
  })
  autoUpdater.on('error', (err) => {
    console.warn('Could not check for updates:', err.message)
    set('idle')
    if (byHand) tell('Otty couldn’t check for updates', 'Check your internet connection, then try again a bit later.')
  })
  set('idle')
  setTimeout(() => checkForUpdates(false), FIRST)
  setInterval(() => checkForUpdates(false), EVERY)
}

export function checkForUpdates(asked = true): void {
  if (state !== 'idle') return
  if (refused('github.com')) {
    if (asked) tell('Otty isn’t looking for updates', 'Your AI service keeps everything on this Mac, so Otty doesn’t go online to check.')
    return
  }
  byHand = asked
  autoUpdater.checkForUpdates()
}

/** The menu bar's and the app menu's update line. Nothing outside the installed app. */
export function updateItems(): Item[] {
  if (state === 'off') return []
  if (state === 'ready') return [{ label: 'Restart to update Otty', click: () => autoUpdater.quitAndInstall() }]
  if (state === 'checking') return [{ label: 'Checking for updates…', enabled: false }]
  return [{ label: 'Check for updates…', click: () => checkForUpdates() }]
}

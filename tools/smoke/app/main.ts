/**
 * The smoke entry (D-47), built on its own into `out-smoke/smoke.js` by `npm run build:smoke`. It isn't part of the app:
 * it loads the release build, `out/main/index.js`, unchanged, so a smoke run tests exactly what ships.
 * Before Otty loads, it makes the run hermetic (own home, mock keychain, no sockets but the world's, no processes but a
 * short list) and swaps the Mac and the network for fakes.
 * The test reaches it through `globalThis.__ottySmoke`, in main only: no preload exposes it, so no page can.
 */
import { join } from 'path'
import { app, nativeTheme, powerMonitor } from 'electron'
import { blocked, guardProcesses, guardRenderers, guardSockets } from './hermetic'
import { installNet, netState } from './net'
import { calls, clickTray, dialogs, installMac, mac, macProcess, notifications, press, shortcuts, trayItems } from './mac'
import { clock, installClock, shiftClock } from './clock'
import type { SmokeMac, SmokeSnapshot } from './types'

const home = process.env['OTTY_SMOKE_HOME']
const world = process.env['OTTY_SMOKE_WORLD']
if (!home || !world) {
  // Started by hand, a smoke build would share the real Otty's settings, chats and keychain, and reach the internet.
  console.error('The smoke build needs OTTY_SMOKE_HOME and OTTY_SMOKE_WORLD.')
  process.exit(1)
}

app.setName('Otty Smoke')
app.setPath('userData', home)
app.setPath('logs', `${home}/logs`) // D-50's log stays in the run's home
app.commandLine.appendSwitch('use-mock-keychain') // safeStorage never touches the login keychain

/** Processes that may really run: local converters and the OCR helper this repo builds. */
const REAL = new Set(['/usr/bin/textutil', 'sips'])
guardSockets(Number(new URL(world).port))
guardProcesses(macProcess, (file) => REAL.has(file) || file.endsWith('/build/bin/otty-ocr'))
guardRenderers()
installNet(world)
installMac(join(__dirname, '..'))
installClock(Number(process.env['OTTY_SMOKE_CLOCK'] ?? 0))

let ready = false

/** Crashes in main. Recorded instead of Electron's error dialog, and each fails the test. */
const errors: string[] = []
process.on('uncaughtException', (err) => void errors.push(`uncaught: ${err.stack ?? String(err)}`))
process.on('unhandledRejection', (err) => void errors.push(`unhandled rejection: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`))

const control = {
  snapshot: (): SmokeSnapshot => ({
    ready,
    errors: [...errors],
    calls: [...calls],
    blocked: [...blocked],
    shortcuts: [...shortcuts.keys()],
    offline: netState.offline,
    clockOffset: clock.offset
  }),
  mac: (change: Partial<SmokeMac>) => Object.assign(mac, change),
  press,
  tray: trayItems,
  clickTray,
  clickNotification: (index: number) => notifications.at(index)?.emit('click'),
  nextOpen: (paths: string[]) => void dialogs.open.push(paths),
  nextSave: (path: string) => void dialogs.save.push(path),
  offline: (on: boolean) => void (netState.offline = on),
  shiftClock,
  power: (event: 'suspend' | 'resume') => powerMonitor.emit(event),
  theme: (mode: 'light' | 'dark' | 'system') => void (nativeTheme.themeSource = mode),
  /** The harness's own check: each way out must be refused. Returns what was refused, and forgets it. */
  probeEscapes: async (): Promise<string[]> => {
    const attempts: (() => unknown)[] = [
      () => require('net').connect(443, '1.1.1.1'),
      () => require('https').get('https://1.1.1.1/'),
      () => require('child_process').spawn('/usr/bin/curl', ['https://example.com']),
      () => require('child_process').execFile('/bin/sh', ['-c', 'echo hi'], () => {})
    ]
    for (const attempt of attempts) {
      try {
        const handle = attempt() as { on?: (e: string, f: () => void) => void } | undefined
        handle?.on?.('error', () => {})
      } catch {
        /* refused */
      }
    }
    await new Promise((r) => setTimeout(r, 100))
    return blocked.splice(0)
  }
}
export type SmokeControl = typeof control
;(globalThis as { __ottySmoke?: SmokeControl }).__ottySmoke = control

// Otty loads only now, so everything it opens lands in the home above and sees the fakes.
require(join(__dirname, '../out/main/index.js'))
void app.whenReady().then(() => {
  ready = true
})

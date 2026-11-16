/**
 * The Mac in a smoke run (D-47). What Otty reads (selection, app in front, snips, permissions) comes from `mac`;
 * what Otty does (scripts, opening things, notifications, the login item) is recorded in `calls`, never done.
 */
import { writeFileSync } from 'fs'
import { clipboard, nativeImage, screen, type Menu, type MenuItem, type Notification } from 'electron'
import type * as ElectronModule from 'electron'
import type { SmokeCall, SmokeMac } from './types'

export const mac: SmokeMac = {
  accessibility: true,
  screen: true,
  selection: null,
  front: null,
  snip: null,
  screenImage: null,
  script: { stdout: '' }
}

export const calls: SmokeCall[] = []
export const shortcuts = new Map<string, () => void>()
export const notifications: Notification[] = []
export const dialogs: { open: string[][]; save: string[] } = { open: [], save: [] }
let trayMenu: Menu | null = null

function record(kind: SmokeCall['kind'], detail: string[]): void {
  calls.push({ kind, detail, at: Date.now() })
}

const ok = (stdout = '') => Promise.resolve({ stdout, stderr: '' })

function bytes(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:[^,]*,/, ''), 'base64')
}

/** The fake Mac's answer to `execFile`, or null to let the guard decide. */
export function macProcess(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> | null {
  if (file === 'screencapture') {
    const path = args[args.length - 1]
    if (mac.snip) writeFileSync(path, bytes(mac.snip))
    return mac.snip ? ok() : Promise.reject(new Error('cancelled'))
  }
  if (file !== 'osascript') return null
  const lines = args.filter((_a, i) => args[i - 1] === '-e')
  const text = lines.join('\n')
  if (text.includes('keystroke "c" using {command down}')) {
    // The real ⌘C copies the highlight into the clipboard Otty is watching.
    if (!mac.accessibility) return Promise.reject(new Error('not allowed'))
    // Electron 45's clipboard is async: the copy lands before osascript "returns", as a real ⌘C would.
    return mac.selection !== null ? clipboard.writeText(mac.selection).then(() => ok()) : ok()
  }
  if (text.includes('first application process whose frontmost is true')) {
    const f = mac.front
    return f ? ok(`4242\n${f.name}\n${f.bundleId}\n${f.title ?? ''}\n`) : Promise.reject(new Error('no app'))
  }
  if (/^tell application id ".*" to return URL/.test(text)) {
    return mac.front?.url ? ok(`${mac.front.url}\n`) : Promise.reject(new Error('no page'))
  }
  record('osascript', args)
  return mac.script.fail ? Promise.reject(new Error(mac.script.fail)) : ok(mac.script.stdout)
}

function flatten(menu: Menu | null): MenuItem[] {
  return (menu?.items ?? []).flatMap((i) => [i, ...flatten(i.submenu ?? null)])
}

export function trayItems(): string[] {
  return flatten(trayMenu).filter((i) => i.type !== 'separator').map((i) => i.label)
}

export function clickTray(label: string): boolean {
  const item = flatten(trayMenu).find((i) => i.label === label)
  if (!item) return false
  item.click()
  return true
}

export function press(accelerator: string): boolean {
  const run = shortcuts.get(accelerator)
  run?.()
  return Boolean(run)
}

type Fn = (...args: never[]) => unknown

/** The real object, with some methods replaced. Real methods stay bound to the real object, as native ones need. */
function overlay<T extends object>(real: T, fakes: Record<string, Fn>): T {
  return new Proxy(real, {
    get(target, key) {
      if (typeof key === 'string' && key in fakes) return fakes[key]
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

/** A class whose instances are overlays, so a fake method sees the real instance as its first argument. */
function overlayClass<C extends new (...args: never[]) => object>(Real: C, fakes: Record<string, (self: InstanceType<C>, ...args: never[]) => unknown>, statics: Record<string, Fn> = {}): C {
  return new Proxy(Real, {
    construct(target, args) {
      const self = Reflect.construct(target, args) as InstanceType<C>
      const bound = Object.fromEntries(Object.entries(fakes).map(([k, f]) => [k, (...a: never[]) => f(self, ...a)]))
      return overlay(self, bound)
    },
    get(target, key) {
      if (typeof key === 'string' && key in statics) return statics[key]
      return Reflect.get(target, key)
    }
  })
}

/**
 * Otty's `require('electron')` gets the real module with its Mac-facing parts swapped for the fake Mac.
 * Electron's own module can't be changed (its getters aren't configurable, and native methods are reset at ready),
 * so the swap happens where Otty asks for it. The smoke entry itself keeps the real module.
 */
export function installMac(): void {
  const electron = require('electron') as typeof ElectronModule
  const fakes: Partial<Record<keyof typeof electron, unknown>> = {
    globalShortcut: {
      register: (accelerator: string, run: () => void) => {
        if (shortcuts.has(accelerator)) return false
        shortcuts.set(accelerator, run)
        return true
      },
      registerAll: (accelerators: string[], run: () => void) => accelerators.forEach((a) => shortcuts.set(a, run)),
      isRegistered: (accelerator: string) => shortcuts.has(accelerator),
      unregister: (accelerator: string) => void shortcuts.delete(accelerator),
      unregisterAll: () => shortcuts.clear(),
      setSuspended: () => {},
      isSuspended: () => false
    },
    Tray: overlayClass(electron.Tray, {
      setContextMenu: (self, menu: Menu | null) => {
        trayMenu = menu
        self.setContextMenu(menu)
      }
    }),
    Notification: overlayClass(
      electron.Notification,
      {
        show: (self) => {
          notifications.push(self)
          record('notify', [self.title, self.body])
        }
      },
      { isSupported: () => true }
    ),
    shell: overlay(electron.shell, {
      openExternal: async (url: string) => record('open-external', [url]),
      openPath: async (path: string) => {
        record('open-path', [path])
        return ''
      },
      showItemInFolder: (path: string) => record('show-in-folder', [path])
    }),
    dialog: overlay(electron.dialog, {
      showOpenDialog: async () => {
        const paths = dialogs.open.shift()
        record('dialog', ['open', ...(paths ?? [])])
        return { canceled: !paths, filePaths: paths ?? [] }
      },
      showSaveDialog: async () => {
        const path = dialogs.save.shift()
        record('dialog', ['save', path ?? ''])
        return { canceled: !path, filePath: path ?? '' }
      }
    }),
    systemPreferences: overlay(electron.systemPreferences, {
      isTrustedAccessibilityClient: () => mac.accessibility,
      getMediaAccessStatus: (kind: string) => (kind === 'screen' ? (mac.screen ? 'granted' : 'denied') : 'granted')
    }),
    desktopCapturer: overlay(electron.desktopCapturer, {
      getSources: async () => {
        if (!mac.screen) throw new Error('Screen Recording is off')
        const display = screen.getPrimaryDisplay()
        const thumbnail = mac.screenImage ? nativeImage.createFromBuffer(bytes(mac.screenImage)) : nativeImage.createEmpty()
        return [{ id: `screen:${display.id}`, name: 'Screen', display_id: String(display.id), thumbnail, appIcon: null }]
      }
    })
  }
  const value = (key: string | symbol) => (typeof key === 'string' && key in fakes ? fakes[key as keyof typeof fakes] : Reflect.get(electron, key))
  const swapped = new Proxy(
    {},
    {
      get: (_t, key) => value(key),
      has: (_t, key) => key in electron,
      ownKeys: () => Reflect.ownKeys(electron),
      getOwnPropertyDescriptor: (_t, key) => ({ configurable: true, enumerable: true, get: () => value(key) })
    }
  )
  const Module = require('module') as { _load: (request: string, ...rest: unknown[]) => unknown }
  const load = Module._load
  Module._load = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === 'electron' ? swapped : load.call(this, request, ...rest)
  }
}

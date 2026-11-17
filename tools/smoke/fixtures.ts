/**
 * The smoke fixture (D-47): each test gets a fresh home, a fresh world and the real app, built by `npm run build:smoke`.
 * At the end, a test fails if the app crashed, logged an error, tried to leave the machine or asked the world for
 * something nobody scripted.
 */
import { _electron as electron, expect, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { SmokeControl } from './app/main'
import type { SmokeMac, SmokeSnapshot } from './app/types'
import { World } from './world/server'

export const ROOT = resolve(__dirname, '../..')
const ENTRY = join(ROOT, 'out-smoke/smoke.js')

/** The key the seeded settings hold. It only ever reaches the world. */
export const SMOKE_KEY = 'sk-smoke-0000000000000000'

export type View = 'panel' | 'quick' | 'bubble' | 'pickup' | 'viewer'

/** Saved settings to start from. `null` starts like a first launch. */
export type Seed = Record<string, unknown> | null

export const ONBOARDED: Record<string, unknown> = {
  onboarded: true,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  homeLanguage: null,
  // Plain, so a seeded key never needs a keychain at all.
  apiKeys: { deepseek: { enc: Buffer.from(SMOKE_KEY).toString('base64'), plain: true } }
}

/** Only what Electron needs from the environment. In particular, no real API keys reach the app. */
function appEnv(extra: Record<string, string>): Record<string, string> {
  const keep = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', '__CF_USER_TEXT_ENCODING']
  const env: Record<string, string> = {}
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!
  return { ...env, LANG: 'en_US.UTF-8', ...extra }
}

export class Otty {
  app!: ElectronApplication
  /** Errors from any window: console errors and uncaught page errors. */
  readonly pageErrors: string[] = []

  constructor(
    readonly home: string,
    readonly world: World,
    private worldUrl: string
  ) {}

  async launch(): Promise<void> {
    if (!existsSync(ENTRY)) throw new Error('No smoke build. Run `npm run build:smoke` first.')
    this.app = await electron.launch({
      args: [ENTRY],
      cwd: ROOT,
      env: appEnv({ OTTY_SMOKE_HOME: this.home, OTTY_SMOKE_WORLD: this.worldUrl })
    })
    this.app.on('window', (page) => this.watch(page))
    for (const page of this.app.windows()) this.watch(page)
    await expect.poll(() => this.snapshot().then((s) => s.ready), { message: 'Otty never became ready' }).toBe(true)
  }

  private watch(page: Page): void {
    const where = () => page.url().match(/view=(\w+)/)?.[1] ?? page.url()
    page.on('pageerror', (err) => this.pageErrors.push(`${where()}: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') this.pageErrors.push(`${where()}: ${msg.text()}`)
    })
  }

  /** Run something against the smoke control in main. `fn` is serialised, so it can only use its arguments. */
  control<A, R>(fn: (c: SmokeControl, arg: A) => R, arg?: A): Promise<Awaited<R>> {
    return this.app.evaluate(
      (_electron, [source, a]) => {
        const c = (globalThis as unknown as { __ottySmoke: SmokeControl }).__ottySmoke
        // oxlint-disable-next-line no-eval -- runs in main on a function the spec wrote, never on app data
        return (0, eval)(`(${source})`)(c, a)
      },
      [fn.toString(), arg] as const
    ) as Promise<Awaited<R>>
  }

  snapshot(): Promise<SmokeSnapshot> {
    return this.control((c) => c.snapshot())
  }

  /** One of Otty's windows, by its view. Waits for it to exist. */
  async view(view: View): Promise<Page> {
    const find = () => this.app.windows().find((w) => w.url().includes(`view=${view}`))
    await expect.poll(() => Boolean(find()), { message: `no ${view} window` }).toBe(true)
    const page = find()!
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  /** Quit the way the menu does, then start again on the same home. */
  async relaunch(): Promise<void> {
    await this.close()
    await this.launch()
  }

  /** Kill main mid-whatever, like a force quit, then start again on the same home. */
  async crash(): Promise<void> {
    this.app.process().kill('SIGKILL')
    await this.app.waitForEvent('close').catch(() => {})
    await this.launch()
  }

  async close(): Promise<void> {
    await this.app.close().catch(() => {})
  }

  // ── Helpers shared by specs ──

  /** The full panel, opened the way the menu bar's "Open chat" does. */
  async openPanel(): Promise<Page> {
    await this.control((c) => c.clickTray('Open chat'))
    const panel = await this.view('panel')
    await expect(panel.locator('body')).toBeVisible()
    return panel
  }

  /** Type a question into a panel or quick view and send it. */
  async ask(page: Page, text: string): Promise<void> {
    const box = page.locator('textarea').last()
    await box.fill(text)
    await box.press('Enter')
  }

  /** Change what the fake Mac reports (selection, app in front, permissions, snips). */
  mac(change: Partial<SmokeMac>): Promise<unknown> {
    return this.control((c, a) => c.mac(a), change)
  }

  /** Press one of Otty's global shortcuts, as the user would. Fails if Otty didn't register it. */
  async press(accelerator: string): Promise<void> {
    expect(await this.control((c, a) => c.press(a), accelerator), `${accelerator} isn't registered`).toBe(true)
  }

  /** Text that should never reach a user. A spec whose answers legitimately contain such text can turn the check off. */
  rawTextAllowed = false

  /** The checks every test ends with. */
  async expectClean(): Promise<void> {
    const s = await this.snapshot()
    expect(s.blocked, 'the app tried to leave the machine or run something').toEqual([])
    expect(s.errors, 'main crashed or left a promise unhandled').toEqual([])
    expect(this.pageErrors, 'a window logged an error').toEqual([])
    expect(this.world.unscripted, 'the app asked the world for something nobody scripted').toEqual([])
    if (!this.rawTextAllowed) await this.expectNoRawErrors()
  }

  /** CLAUDE.md: friendly copy, no raw errors. Checks the visible text of every open window. */
  async expectNoRawErrors(): Promise<void> {
    for (const page of this.app.windows()) {
      if (page.isClosed()) continue
      const text = await page.locator('body').innerText().catch(() => '')
      const found = RAW_ERROR.map((re) => text.match(re)?.[0]).filter(Boolean)
      expect(found, `raw error text in ${page.url().match(/view=(\w+)/)?.[1] ?? 'a window'}`).toEqual([])
    }
  }
}

/** Shapes of text that mean an error leaked to the screen. */
const RAW_ERROR = [/\b(?:Type|Reference|Syntax|Range)Error\b/, /\bError: /, /\bundefined\b/, /\bNaN\b/, /\[object \w+\]/, /\bat \S+ \(\S+:\d+:\d+\)/, /\bstatus code \d{3}\b/i]

/** pbcopy and pbpaste turn anything outside ASCII into "?" unless the locale says UTF-8. */
const UTF8 = { env: { ...process.env, LANG: 'en_US.UTF-8' } }

/** The real clipboard's text. The user's is put back after each test; formats other than text aren't kept. */
export const pbpaste = (): string => execFileSync('pbpaste', { ...UTF8, encoding: 'utf8' })
export const pbcopy = (text: string): void => void execFileSync('pbcopy', { ...UTF8, input: text })

function readClipboard(): string {
  try {
    return pbpaste()
  } catch {
    return ''
  }
}
function writeClipboard(text: string): void {
  try {
    pbcopy(text)
  } catch {
    /* nothing to restore */
  }
}

export const test = base.extend<{ seed: Seed; world: World; otty: Otty }, { worldServer: { world: World; url: string } }>({
  seed: [ONBOARDED, { option: true }],

  worldServer: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern
    async ({}, use) => {
      const world = new World()
      const url = await world.start()
      await use({ world, url })
      await world.stop()
    },
    { scope: 'worker' }
  ],

  world: async ({ worldServer }, use) => {
    worldServer.world.reset()
    await use(worldServer.world)
  },

  otty: async ({ seed, world, worldServer }, use, info) => {
    const clipboard = readClipboard()
    const home = mkdtempSync(join(tmpdir(), 'otty-smoke-'))
    if (seed) {
      mkdirSync(home, { recursive: true })
      writeFileSync(join(home, 'settings.json'), JSON.stringify(seed, null, 2))
    }
    const otty = new Otty(home, world, worldServer.url)
    await otty.launch()
    try {
      await use(otty)
      await otty.expectClean()
    } finally {
      if (info.status !== info.expectedStatus) {
        const s = await otty.snapshot().catch(() => null)
        if (s) await info.attach('smoke-snapshot.json', { body: JSON.stringify(s, null, 2), contentType: 'application/json' })
        await info.attach('world-requests.json', { body: JSON.stringify(world.requests, null, 2), contentType: 'application/json' })
      }
      await otty.close()
      rmSync(home, { recursive: true, force: true })
      writeClipboard(clipboard)
    }
  }
})

export { expect }

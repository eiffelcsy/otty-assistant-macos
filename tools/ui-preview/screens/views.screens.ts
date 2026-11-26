import { expect, test, type Page } from '@playwright/test'

// Every view and scene the UI preview has (tools/ui-preview/mock.ts), in both colour schemes.
const SCENES: Record<string, string[]> = {
  panel: ['chat', 'compose', 'empty', 'tray', 'settings', 'provider', 'page', 'proofread', 'memory', 'memories', 'math', 'code', 'drawing', 'chart', 'cap', 'steps', 'logbook', 'logbook-wait', 'logbook-next', 'logbook-sent', 'logbook-changed', 'logbook-noted', 'logbook-empty', 'logbook-running', 'logbook-paused', 'logbook-entry', 'logbook-search', 'logbook-none', 'history', 'find', 'onboarding', 'settings-you', 'settings-keys', 'settings-privacy', 'settings-usage', 'settings-conn', 'settings-help', 'settings-feedback', 'settings-find', 'settings-retention', 'settings-broken', 'settings-recording', 'connections', 'connections-add', 'connections-mcp', 'connections-off', 'connect-card', 'confirm-read', 'confirm-open', 'confirm-search', 'confirm-reminder', 'confirm-unusual', 'receipts', 'rewind', 'noted', 'thinking', 'stopped', 'failed-key', 'failed-long', 'near', 'typography', 'paused', 'frame-menu', 'frame-pushed', 'frame-rail', 'frame-medium', 'frame-wide', 'frame-min', 'home', 'home-quiet', 'home-first', 'home-running', 'home-paused', 'calendar', 'calendar-list', 'calendar-empty', 'calendar-edit', 'calendar-note', 'confirm-event', 'pouch', 'pouch-list', 'pouch-empty', 'pouch-card', 'pouch-search'],
  quick: ['chat', 'compose', 'page', 'tray', 'proofread', 'steps'],
  pickup: ['reading', 'nowords', 'failed'],
  viewer: ['picture', 'slides'],
  // Spec 13, Part 5: the pool (asleep is left out: the mock can't start Otty asleep without a change to the app).
  bubble: ['pool', 'pool-working', 'pool-waiting', 'pool-answer', 'pool-paused', 'pool-night']
}

/** Scenes with Chinese text, which each macOS draws a little differently (about 0.7% of the picture). A moved card is
 * still well over this. */
const CHINESE = new Set(['panel chat', 'panel find'])

/**
 * The page's media features, all pinned: the scheme under test, reduced motion, and the Mac's accessibility settings
 * off. CI's Mac reports Reduce transparency or Increase contrast on, which drew every cove scene solid. Playwright's
 * `emulateMedia` can't set transparency, so this goes through the DevTools protocol, which replaces every feature.
 */
async function media(page: Page, scheme: 'light' | 'dark'): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: scheme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-reduced-transparency', value: 'no-preference' },
      { name: 'prefers-contrast', value: 'no-preference' }
    ]
  })
}

/** The mock's sample chats are dated from now, so the clock is fixed for "2 hours ago" to stay the same. */
const NOW = new Date('2026-11-17T10:00:00+08:00')

for (const scheme of ['light', 'dark'] as const) {
  for (const [view, scenes] of Object.entries(SCENES)) {
    for (const scene of scenes) {
      test(`${view} ${scene} ${scheme}`, async ({ page }) => {
        const scrolled = () => page.evaluate(() => [...document.querySelectorAll('*')].map((e) => e.scrollTop).join())
        await media(page, scheme)
        await page.clock.setFixedTime(NOW)
        // The frame's wide scenes need room for the window itself (D-64).
        if (scene.startsWith('frame-')) await page.setViewportSize({ width: 1340, height: 800 })
        await page.goto(`/?view=${view}&scene=${scene}`)
        // The mock plays its events over the first few hundred ms; drawings render lazily after that, and the chat
        // glides to its last message at its own pace.
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(800)
        let last = ''
        await expect.poll(async () => last === (last = await scrolled()), { intervals: [250], timeout: 5_000 }).toBe(true)
        await expect(page).toHaveScreenshot(`${view}-${scene}-${scheme}.png`, CHINESE.has(`${view} ${scene}`) ? { maxDiffPixelRatio: 0.01 } : {})
      })
    }
  }
}

// D-74 (Spec 07): the cove, full bleed, at the floating, medium and roomy widths, for each painting in light mode and
// the night in dark (`&time=` pins the painting), then Home scrolled past its greeting.
const COVE_SIZES: [w: number, h: number, state: string][] = [
  [420, 640, ''],
  [980, 660, '&state=roomy'],
  [1280, 800, '&state=roomy']
]
const COVE_TIMES: [time: string, scheme: 'light' | 'dark'][] = [
  ['dawn', 'light'],
  ['day', 'light'],
  ['golden', 'light'],
  ['night', 'light'],
  ['night', 'dark']
]
for (const scene of ['home', 'empty', 'home-scrolled']) {
  for (const [w, h, state] of scene === 'home-scrolled' ? COVE_SIZES.slice(1, 2) : COVE_SIZES) {
    for (const [time, scheme] of scene === 'home-scrolled' ? COVE_TIMES.slice(1, 2) : COVE_TIMES) {
      test(`cove ${scene} ${w} ${time} ${scheme}`, async ({ page }) => {
        await media(page, scheme)
        await page.clock.setFixedTime(NOW)
        await page.setViewportSize({ width: Math.max(w + 60, 480), height: h + 60 })
        await page.goto(`/?view=panel&scene=${scene === 'home-scrolled' ? 'home' : scene}&w=${w}&h=${h}${state}&time=${time}`)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(800)
        if (scene === 'home-scrolled') await page.locator('.home').evaluate((el) => el.scrollTo(0, el.scrollHeight))
        await page.waitForTimeout(300)
        await expect(page).toHaveScreenshot(`cove-${scene}-${w}-${time}-${scheme}.png`)
      })
    }
  }
}

import { expect, test } from '@playwright/test'

// Every view and scene the UI preview has (tools/ui-preview/mock.ts), in both colour schemes.
const SCENES: Record<string, string[]> = {
  panel: ['chat', 'compose', 'empty', 'tray', 'settings', 'provider', 'page', 'proofread', 'memory', 'memories', 'math', 'code', 'drawing', 'chart', 'cap', 'steps', 'activity', 'history', 'find', 'onboarding'],
  quick: ['chat', 'compose', 'page', 'tray', 'proofread', 'steps'],
  pickup: ['reading', 'nowords', 'failed'],
  viewer: ['picture', 'slides']
}

/** The mock's sample chats are dated from now, so the clock is fixed for "2 hours ago" to stay the same. */
const NOW = new Date('2026-11-17T10:00:00+08:00')

for (const scheme of ['light', 'dark'] as const) {
  for (const [view, scenes] of Object.entries(SCENES)) {
    for (const scene of scenes) {
      test(`${view} ${scene} ${scheme}`, async ({ page }) => {
        const scrolled = () => page.evaluate(() => [...document.querySelectorAll('*')].map((e) => e.scrollTop).join())
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await page.clock.setFixedTime(NOW)
        await page.goto(`/?view=${view}&scene=${scene}`)
        // The mock plays its events over the first few hundred ms; drawings render lazily after that, and the chat
        // glides to its last message at its own pace.
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(800)
        let last = ''
        await expect.poll(async () => last === (last = await scrolled()), { intervals: [250], timeout: 5_000 }).toBe(true)
        await expect(page).toHaveScreenshot(`${view}-${scene}-${scheme}.png`)
      })
    }
  }
}
